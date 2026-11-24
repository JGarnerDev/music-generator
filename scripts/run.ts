// run.ts -- start-or-reuse launcher for this project's dev servers and long jobs.
// Source: the hub's new-project starter (.claude/skills/new-project/starter/scripts/run.ts).
// Every project keeps an identical copy; change it there first, then copy it out.
// Config: scripts/run.json. State: .run/ (gitignored). No dependencies; Node 24+.
//
//   node scripts/run.ts list                 what's running (dead entries are pruned first)
//   node scripts/run.ts up <server> [--keep] start the server, or print the one already running
//   node scripts/run.ts job <job> [-- args]  run a job in the foreground; refuses if it's already running
//   node scripts/run.ts stop <name>|--all    stop one, or everything this project started
//   node scripts/run.ts prune                drop entries whose process is gone
//   node scripts/run.ts hook <event>         Claude Code hooks: session-start, session-end, pre-bash
//
// Servers run detached and log to .run/<name>.log. A server started by a Claude session is
// stopped when that session ends, unless started with --keep. Jobs inherit the terminal.

import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { lookup } from "node:dns/promises";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ServerSpec = { command: string; url: string; timeout_s: number };
export type JobSpec = { command: string };
export type GuardRule = { pattern: RegExp; use: string };
export type Config = {
  servers: Record<string, ServerSpec>;
  jobs: Record<string, JobSpec>;
  guard: GuardRule[];
};
export type Entry = {
  name: string;
  kind: "server" | "job";
  pid: number;
  command: string;
  url: string | null;
  session: string;
  keep: boolean;
  started: string;
};

export const RUN_SCRIPT = "scripts/run.ts";
const NAME_RE = /^[a-z][a-z0-9-]*$/;
const LOCK_WAIT_MS = 30_000;
const POLL_MS = 500;

export class RunError extends Error {}

// ---------- config: validated whole, at the boundary ----------

function expectKeys(
  where: string,
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RunError(`${where}: expected an object`);
  }
  const obj = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(obj).filter((k) => !allowed.has(k));
  if (unknown.length) throw new RunError(`${where}: unknown key(s) ${unknown.join(", ")}`);
  const missing = required.filter((k) => !(k in obj));
  if (missing.length) throw new RunError(`${where}: missing key(s) ${missing.join(", ")}`);
  return obj;
}

function expectString(where: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new RunError(`${where}: expected a non-empty string`);
  return value;
}

function expectNamedMap<T>(
  where: string,
  value: unknown,
  parse: (where: string, v: unknown) => T,
): Record<string, T> {
  const obj = expectKeys(where, value, [], Object.keys((value ?? {}) as object));
  const out: Record<string, T> = {};
  for (const [name, spec] of Object.entries(obj)) {
    if (!NAME_RE.test(name))
      throw new RunError(`${where}.${name}: names are lowercase-kebab (${NAME_RE})`);
    out[name] = parse(`${where}.${name}`, spec);
  }
  return out;
}

export function parseConfig(raw: unknown): Config {
  const top = expectKeys("run.json", raw, [], ["$comment", "servers", "jobs", "guard"]);
  const servers = expectNamedMap("servers", top.servers ?? {}, (where, v) => {
    const s = expectKeys(where, v, ["command", "url"], ["timeout_s"]);
    const url = expectString(`${where}.url`, s.url);
    if (!/^https?:\/\/[^/]+:\d+\//.test(url))
      throw new RunError(`${where}.url: needs an explicit port, e.g. http://127.0.0.1:5174/`);
    const timeout_s = s.timeout_s ?? 60;
    if (typeof timeout_s !== "number" || !(timeout_s > 0))
      throw new RunError(`${where}.timeout_s: expected a positive number`);
    return { command: expectString(`${where}.command`, s.command), url, timeout_s };
  });
  const jobs = expectNamedMap("jobs", top.jobs ?? {}, (where, v) => {
    const j = expectKeys(where, v, ["command"]);
    return { command: expectString(`${where}.command`, j.command) };
  });
  const clash = Object.keys(jobs).filter((n) => n in servers);
  if (clash.length) throw new RunError(`run.json: ${clash.join(", ")} is both a server and a job`);
  if (top.guard !== undefined && !Array.isArray(top.guard))
    throw new RunError("guard: expected a list");
  const guard = ((top.guard ?? []) as unknown[]).map((g, i) => {
    const r = expectKeys(`guard[${i}]`, g, ["pattern", "use"]);
    const source = expectString(`guard[${i}].pattern`, r.pattern);
    try {
      return { pattern: new RegExp(source), use: expectString(`guard[${i}].use`, r.use) };
    } catch (e) {
      throw new RunError(`guard[${i}].pattern: ${(e as Error).message}`);
    }
  });
  return { servers, jobs, guard };
}

export function loadConfig(root: string): Config {
  const path = join(root, "scripts", "run.json");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new RunError(`no ${path}; see the comment at the top of ${RUN_SCRIPT}`);
  }
  try {
    return parseConfig(JSON.parse(text));
  } catch (e) {
    if (e instanceof RunError) throw e;
    throw new RunError(`${path}: ${(e as Error).message}`);
  }
}

// ---------- processes ----------

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Kill the process and its children (npm -> node -> esbuild, uv -> python). */
export function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM"); // detached children lead their own process group
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

export async function urlAnswers(
  url: string,
  { timeout_ms = 2000 }: { timeout_ms?: number } = {},
): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(timeout_ms) });
    return true; // any HTTP status means something is listening
  } catch {
    return false;
  }
}

/**
 * True if something accepts connections on the url's port, on any address its host resolves
 * to (localhost is often ::1 only). Unlike urlAnswers, a server busy with a slow first request
 * still counts as taken.
 */
export async function portOpen(
  url: string,
  { timeout_ms = 1000 }: { timeout_ms?: number } = {},
): Promise<boolean> {
  const { hostname, port } = new URL(url);
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true }).catch(() => [{ address: host }]);
  const tries = addresses.map(
    ({ address }) =>
      new Promise<boolean>((res) => {
        const socket = connect({ host: address, port: Number(port), timeout: timeout_ms });
        const done = (open: boolean): void => {
          socket.destroy();
          res(open);
        };
        socket.once("connect", () => done(true));
        socket.once("timeout", () => done(false));
        socket.once("error", () => done(false));
      }),
  );
  return (await Promise.all(tries)).some(Boolean);
}

// ---------- registry: one file per running thing in .run/ ----------

const runDir = (root: string): string => join(root, ".run");
const entryPath = (root: string, name: string): string => join(runDir(root), `${name}.json`);
export const logPath = (root: string, name: string): string => join(runDir(root), `${name}.log`);

function readEntry(root: string, name: string): Entry | null {
  try {
    return JSON.parse(readFileSync(entryPath(root, name), "utf8")) as Entry;
  } catch {
    return null;
  }
}

function writeEntry(root: string, entry: Entry): void {
  mkdirSync(runDir(root), { recursive: true });
  writeFileSync(entryPath(root, entry.name), JSON.stringify(entry, null, 2) + "\n");
}

function removeEntry(root: string, name: string): void {
  rmSync(entryPath(root, name), { force: true });
}

/** Live entries; removes the files of dead ones and returns their names too. */
export function prune(root: string): { live: Entry[]; removed: string[] } {
  let files: string[] = [];
  try {
    files = readdirSync(runDir(root)).filter((f) => f.endsWith(".json"));
  } catch {
    return { live: [], removed: [] };
  }
  const live: Entry[] = [];
  const removed: string[] = [];
  for (const file of files) {
    const name = file.slice(0, -".json".length);
    const entry = readEntry(root, name);
    if (entry && pidAlive(entry.pid)) live.push(entry);
    else {
      removeEntry(root, name);
      removed.push(name);
    }
  }
  return { live: live.sort((a, b) => a.name.localeCompare(b.name)), removed };
}

/** Run `fn` holding .run/<name>.lock, so two sessions can't start the same thing at once. */
export async function withLock<T>(root: string, name: string, fn: () => Promise<T>): Promise<T> {
  mkdirSync(runDir(root), { recursive: true });
  const lock = join(runDir(root), `${name}.lock`);
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      writeFileSync(lock, String(process.pid));
      break;
    } catch {
      const holder = Number(readFileSync(lock, { encoding: "utf8", flag: "a+" }) || NaN);
      if (Number.isInteger(holder) && !pidAlive(holder)) rmSync(lock, { force: true });
      else if (Date.now() > deadline)
        throw new RunError(`${name}: still locked by pid ${holder} after ${LOCK_WAIT_MS / 1000}s`);
      else await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

export const currentSession = (): string => process.env.RUN_SESSION_ID || "manual";

// ---------- commands ----------

export type UpResult = { status: "reused" | "started"; entry: Entry };

export async function up(
  root: string,
  config: Config,
  name: string,
  { keep }: { keep: boolean },
): Promise<UpResult> {
  const spec = config.servers[name];
  if (!spec)
    throw new RunError(
      `no server '${name}'. Servers: ${Object.keys(config.servers).join(", ") || "none"}`,
    );
  return withLock(root, name, async () => {
    const existing = readEntry(root, name);
    if (existing && pidAlive(existing.pid)) {
      if (keep && !existing.keep) writeEntry(root, { ...existing, keep: true });
      return { status: "reused", entry: { ...existing, keep: existing.keep || keep } };
    }
    removeEntry(root, name);
    if (await portOpen(spec.url)) {
      throw new RunError(
        `${spec.url} is already taken, but not by a server run.ts started. ` +
          `Find it (Windows: netstat -ano | findstr :${new URL(spec.url).port}) and stop it, or use it as is.`,
      );
    }
    mkdirSync(runDir(root), { recursive: true });
    const log = openSync(logPath(root, name), "w");
    const child = spawn(spec.command, {
      cwd: root,
      shell: true,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", log, log],
    });
    closeSync(log);
    child.unref();
    if (child.pid === undefined) throw new RunError(`${name}: could not start '${spec.command}'`);
    const entry: Entry = {
      name, kind: "server", pid: child.pid, command: spec.command, url: spec.url,
      session: currentSession(), keep, started: new Date().toISOString(),
    }; // prettier-ignore
    writeEntry(root, entry);
    const deadline = Date.now() + spec.timeout_s * 1000;
    while (Date.now() < deadline) {
      if (!pidAlive(child.pid)) {
        removeEntry(root, name);
        throw new RunError(`${name} exited during startup:\n${tail(logPath(root, name))}`);
      }
      if (await urlAnswers(spec.url)) return { status: "started", entry };
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    killTree(child.pid);
    removeEntry(root, name);
    throw new RunError(
      `${name} did not answer at ${spec.url} within ${spec.timeout_s}s:\n${tail(logPath(root, name))}`,
    );
  });
}

function tail(path: string, { lines = 15 }: { lines?: number } = {}): string {
  try {
    return readFileSync(path, "utf8").trimEnd().split(/\r?\n/).slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}

/** Claim the job's slot, or throw saying who holds it. The caller runs the job, then calls release(). */
export async function claimJob(
  root: string,
  config: Config,
  name: string,
  args: string[],
): Promise<Entry> {
  const spec = config.jobs[name];
  if (!spec)
    throw new RunError(`no job '${name}'. Jobs: ${Object.keys(config.jobs).join(", ") || "none"}`);
  return withLock(root, name, async () => {
    const existing = readEntry(root, name);
    if (existing && pidAlive(existing.pid)) {
      throw new RunError(
        `${name} is already running: pid ${existing.pid}, since ${existing.started}, session ${existing.session}\n` +
          `  ${existing.command}\nWait for it to finish, or stop it: node ${RUN_SCRIPT} stop ${name}`,
      );
    }
    const entry: Entry = {
      name, kind: "job", pid: process.pid, command: [spec.command, ...args.map(quoteArg)].join(" "),
      url: null, session: currentSession(), keep: false, started: new Date().toISOString(),
    }; // prettier-ignore
    writeEntry(root, entry);
    return entry;
  });
}

export function quoteArg(arg: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

async function runJob(root: string, config: Config, name: string, args: string[]): Promise<number> {
  const entry = await claimJob(root, config, name, args);
  try {
    const child = spawn(entry.command, { cwd: root, shell: true, stdio: "inherit" });
    const forward = (sig: NodeJS.Signals) => child.kill(sig);
    process.on("SIGINT", forward).on("SIGTERM", forward);
    return await new Promise<number>((res) => child.on("exit", (code) => res(code ?? 1)));
  } finally {
    removeEntry(root, name);
  }
}

export function stop(
  root: string,
  which: { name: string } | { session: string } | { all: true },
): Entry[] {
  const { live } = prune(root);
  const targets = live.filter((e) =>
    "name" in which
      ? e.name === which.name
      : "session" in which
        ? e.session === which.session && !e.keep
        : true,
  );
  for (const e of targets) {
    killTree(e.pid);
    removeEntry(root, e.name);
  }
  return targets;
}

export function formatEntries(entries: Entry[]): string {
  if (!entries.length) return "nothing running";
  return entries
    .map((e) => {
      const where = e.url ?? `pid ${e.pid}`;
      const keep = e.keep ? ", keep" : "";
      return `${e.name} (${e.kind}) ${where}  pid ${e.pid}, since ${e.started}, session ${e.session}${keep}\n  ${e.command}`;
    })
    .join("\n");
}

// ---------- guard: block long-running commands that skip the launcher ----------

/** The segments of a shell command line, split on && || ; | and newlines. */
export function commandSegments(command: string): string[] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const LAUNCHER_RE = /^node\s+("?)(\$CLAUDE_PROJECT_DIR\/|\.\/)?scripts\/run\.ts\1(\s|$)/;

/** The first guard rule a segment breaks, or null. Segments that call the launcher are allowed. */
export function guardViolation(
  config: Config,
  command: string,
): { segment: string; rule: GuardRule } | null {
  for (const segment of commandSegments(command)) {
    if (LAUNCHER_RE.test(segment)) continue;
    const rule = config.guard.find((r) => r.pattern.test(segment));
    if (rule) return { segment, rule };
  }
  return null;
}

// ---------- hooks ----------

async function readStdinJson(): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

async function hook(root: string, event: string): Promise<number> {
  const input = await readStdinJson();
  const session = typeof input.session_id === "string" ? input.session_id : "";
  if (event === "session-start") {
    if (session && process.env.CLAUDE_ENV_FILE)
      appendFileSync(process.env.CLAUDE_ENV_FILE, `export RUN_SESSION_ID=${session}\n`);
    const { live } = prune(root);
    console.log(
      live.length
        ? `[run.ts] already running -- reuse these, don't start copies:\n${formatEntries(live)}`
        : `[run.ts] nothing running. Start servers with: node ${RUN_SCRIPT} up <name>`,
    );
    return 0;
  }
  if (event === "session-end") {
    if (session) stop(root, { session });
    return 0;
  }
  if (event === "pre-bash") {
    const toolInput = input.tool_input as { command?: unknown } | undefined;
    const command = typeof toolInput?.command === "string" ? toolInput.command : "";
    const hit = guardViolation(loadConfig(root), command);
    if (!hit) return 0;
    console.error(
      `Blocked by scripts/run.ts: '${hit.segment}' starts a long-running process directly.\nUse: ${hit.rule.use}`,
    );
    return 2; // Claude Code: exit 2 blocks the tool call and shows stderr to Claude
  }
  throw new RunError(`unknown hook '${event}' (session-start, session-end, pre-bash)`);
}

// ---------- CLI ----------

/** The one argument a command takes, or a usage error. */
function onlyArg(args: string[], usage: string): string {
  const [arg] = args;
  if (args.length !== 1 || arg === undefined) throw new RunError(usage);
  return arg;
}

export async function main(argv: string[], root: string): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "list":
      console.log(formatEntries(prune(root).live));
      return 0;
    case "prune": {
      const { removed } = prune(root);
      console.log(removed.length ? `removed: ${removed.join(", ")}` : "nothing to prune");
      return 0;
    }
    case "up": {
      const flags = rest.filter((a) => a.startsWith("-"));
      const names = rest.filter((a) => !a.startsWith("-"));
      const badFlag = flags.find((f) => f !== "--keep");
      const usage = "usage: run.ts up <server> [--keep]";
      if (badFlag) throw new RunError(usage);
      const { status, entry } = await up(root, loadConfig(root), onlyArg(names, usage), {
        keep: flags.includes("--keep"),
      });
      console.log(
        `${status} ${entry.name}: ${entry.url}  (pid ${entry.pid}, log .run/${entry.name}.log)`,
      );
      return 0;
    }
    case "job": {
      const [name, sep, ...args] = rest;
      if (!name || (sep !== undefined && sep !== "--"))
        throw new RunError("usage: run.ts job <job> [-- args...]");
      return runJob(root, loadConfig(root), name, args);
    }
    case "stop": {
      const target = onlyArg(rest, "usage: run.ts stop <name>|--all");
      const stopped = stop(root, target === "--all" ? { all: true } : { name: target });
      console.log(
        stopped.length ? `stopped: ${stopped.map((e) => e.name).join(", ")}` : "nothing to stop",
      );
      return 0;
    }
    case "hook":
      return hook(root, onlyArg(rest, "usage: run.ts hook session-start|session-end|pre-bash"));
    default:
      throw new RunError(
        "usage: run.ts list | up <server> [--keep] | job <job> [-- args] | stop <name>|--all | prune",
      );
  }
}

if (import.meta.main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  main(process.argv.slice(2), root).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof RunError ? `error: ${e.message}` : e);
      process.exit(1);
    },
  );
}
