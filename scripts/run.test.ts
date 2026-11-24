// Tests for run.ts. Run: node --test scripts/run.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
  claimJob, guardViolation, parseConfig, pidAlive, prune, RunError, stop, up, urlAnswers,
} from "./run.ts"; // prettier-ignore

async function freePort(): Promise<number> {
  return new Promise((res) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    });
  });
}

function project(config: object): string {
  const root = mkdtempSync(join(tmpdir(), "run-ts-"));
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "run.json"), JSON.stringify(config));
  return root;
}

describe("parseConfig", () => {
  test("accepts a full config", () => {
    const c = parseConfig({
      servers: { dev: { command: "npm run dev", url: "http://127.0.0.1:5174/" } },
      jobs: { transcribe: { command: "uv run scripts/transcribe.py" } },
      guard: [{ pattern: "\\bnpm run dev\\b", use: "node scripts/run.ts up dev" }],
    });
    assert.equal(c.servers.dev?.timeout_s, 60);
    assert.equal(c.jobs.transcribe?.command, "uv run scripts/transcribe.py");
    assert.ok(c.guard[0]?.pattern.test("npm run dev"));
  });

  const bad: [string, object, RegExp][] = [
    ["unknown top key", { server: {} }, /unknown key\(s\) server/],
    [
      "unknown server key",
      { servers: { dev: { command: "x", url: "http://h:1/", port: 1 } } },
      /unknown key/,
    ],
    [
      "url without port",
      { servers: { dev: { command: "x", url: "http://localhost/" } } },
      /explicit port/,
    ],
    ["bad name", { jobs: { Dev: { command: "x" } } }, /lowercase-kebab/],
    [
      "server and job share a name",
      { servers: { a: { command: "x", url: "http://h:1/" } }, jobs: { a: { command: "y" } } },
      /both/,
    ],
    ["bad regex", { guard: [{ pattern: "(", use: "x" }] }, /guard\[0\]\.pattern/],
    ["empty command", { jobs: { a: { command: " " } } }, /non-empty/],
  ];
  for (const [name, raw, msg] of bad) {
    test(`rejects: ${name}`, () =>
      assert.throws(
        () => parseConfig(raw),
        (e: Error) => e instanceof RunError && msg.test(e.message),
      ));
  }
});

describe("guardViolation", () => {
  // The usual shape: `npm run app` (which runs `node scripts/run.ts up app`) is the one way in,
  // and starting vite any other way is blocked.
  const config = parseConfig({
    guard: [{ pattern: "^(npx |npm exec )?vite( (?!build\\b)|$)", use: "npm run app" }],
  });
  test("blocks a direct start", () =>
    assert.equal(guardViolation(config, "npx vite --port 5174")?.rule.use, "npm run app"));
  test("blocks it inside a chain", () =>
    assert.ok(guardViolation(config, "cd app && npx vite --port 5174")));
  test("allows npm run app", () => assert.equal(guardViolation(config, "npm run app"), null));
  test("allows npm run app from a parent folder", () =>
    assert.equal(guardViolation(config, "npm --prefix app run app -- --keep"), null));
  test("allows the launcher", () =>
    assert.equal(guardViolation(config, "node scripts/run.ts up app"), null));
  test("allows the launcher by project path", () =>
    assert.equal(guardViolation(config, 'node "$CLAUDE_PROJECT_DIR/scripts/run.ts" up app'), null));
  test("a launcher call doesn't excuse the rest of the chain", () =>
    assert.ok(guardViolation(config, "node scripts/run.ts list && npx vite")));
  test("allows unrelated commands", () =>
    assert.equal(guardViolation(config, "npx vite build && git status"), null));
  test("allows commands that only mention vite", () =>
    assert.equal(guardViolation(config, "grep -n vite package.json | head"), null));
  test("blocks bare vite", () => assert.ok(guardViolation(config, "vite")));
});

describe("registry", () => {
  test("prune drops entries whose pid is dead", () => {
    const root = project({});
    mkdirSync(join(root, ".run"));
    const dead = {
      name: "gone",
      kind: "job",
      pid: 999_999_9,
      command: "x",
      url: null,
      session: "s",
      keep: false,
      started: "t",
    };
    writeFileSync(join(root, ".run", "gone.json"), JSON.stringify(dead));
    assert.equal(pidAlive(dead.pid), false);
    assert.deepEqual(prune(root), { live: [], removed: ["gone"] });
    rmSync(root, { recursive: true, force: true });
  });

  test("a second claim on a running job is refused, naming the holder", async () => {
    const root = project({ jobs: { transcribe: { command: "echo hi" } } });
    const config = parseConfig({ jobs: { transcribe: { command: "echo hi" } } });
    const first = await claimJob(root, config, "transcribe", ["session 14"]);
    assert.equal(first.command, 'echo hi "session 14"');
    await assert.rejects(claimJob(root, config, "transcribe", []), /already running: pid \d+/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("up", () => {
  let root: string;
  let url: string;
  let config: ReturnType<typeof parseConfig>;

  before(async () => {
    const port = await freePort();
    url = `http://127.0.0.1:${port}/`;
    const raw = { servers: { web: { command: "node server.js", url, timeout_s: 20 } } };
    root = project(raw);
    writeFileSync(
      join(root, "server.js"),
      `require("http").createServer((q, s) => s.end("ok")).listen(${port}, "127.0.0.1");`,
    );
    config = parseConfig(raw);
  });

  after(() => {
    stop(root, { all: true });
    rmSync(root, { recursive: true, force: true });
  });

  test("starts once, then reuses", async () => {
    process.env.RUN_SESSION_ID = "session-a";
    const first = await up(root, config, "web", { keep: false });
    assert.equal(first.status, "started");
    assert.ok(await urlAnswers(url));
    const second = await up(root, config, "web", { keep: false });
    assert.equal(second.status, "reused");
    assert.equal(second.entry.pid, first.entry.pid);
  });

  test("session end stops what that session started, unless kept", async () => {
    assert.deepEqual(stop(root, { session: "session-b" }), []);
    const stopped = stop(root, { session: "session-a" });
    assert.deepEqual(
      stopped.map((e) => e.name),
      ["web"],
    );
    for (let i = 0; i < 20 && (await urlAnswers(url)); i++)
      await new Promise((r) => setTimeout(r, 250));
    assert.equal(await urlAnswers(url), false);
  });

  test("refuses to start a copy when something else holds the port, even a silent one", async () => {
    const port = Number(new URL(url).port);
    // Accepts but never answers, like a Vite busy with a slow first request.
    const squatter = createServer(() => {}).listen(port, "127.0.0.1");
    await new Promise((r) => squatter.once("listening", r));
    await assert.rejects(
      up(root, config, "web", { keep: false }),
      /already taken, but not by a server run\.ts started/,
    );
    squatter.close();
  });

  test("an unknown server names the known ones", async () => {
    await assert.rejects(up(root, config, "nope", { keep: false }), /Servers: web/);
  });
});
