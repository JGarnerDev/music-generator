/**
 * Land a take that was played somewhere else.
 *
 *   npm run take:import -- --file ~/Downloads/tavern-hook.take.json
 *   npm run take:import -- --stdin
 *   npm run take:import -- --file <path> --name tavern-hook-2 --force
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * The other end of the standalone keys app ([`docs/deploy.md`](../docs/deploy.md)).
 * On this machine the bench saves a take by POSTing it to a Vite plugin; the
 * deployed app has no server to POST to, so it hands the file to the phone
 * instead — a download, the clipboard, or the share sheet — and this is how
 * that file becomes `recordings/keys/<name>.take.json` like any other.
 *
 * It validates before writing, for the reason
 * [`src/dev/take-api.ts`](../src/dev/take-api.ts) does: a take that fails to
 * load is discovered when somebody sits down to compose from it, by which time
 * the hands that could play it again have gone. And it prints the summary on
 * the way through, so importing and reading are one step rather than two —
 * `take:read` is still there for the second opinion.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Command } from "commander";
import { summarizeTake, takeSlug, validateTake, type Take } from "../src/engine/take";
import { TAKES_DIR, resolveTakePath, takeRelativePath } from "../src/dev/take-store";

const program = new Command();
program
  .name("take:import")
  .description("write a take played on the deployed keys app into recordings/keys/")
  .option("--file <path>", "the .take.json handed over by the app")
  .option("--stdin", "read the take from standard input (what Copy puts on the clipboard)")
  .option("--name <slug>", "file it under a different name than the take carries")
  .option("--force", "overwrite a take of that name already on the shelf")
  .parse();

const opts = program.opts<{ file?: string; stdin?: boolean; name?: string; force?: boolean }>();

function fail(message: string): never {
  console.error(`take:import: ${message}`);
  process.exit(1);
}

if (!opts.file && !opts.stdin) fail("--file <path> or --stdin is required");
if (opts.file && opts.stdin) fail("--file and --stdin are alternatives, not a pair");

const raw = opts.stdin ? readFileSync(0, "utf8") : readFile(opts.file!);

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  fail(`that is not JSON: ${(err as Error).message}`);
}

const issues = validateTake(parsed);
if (issues.length > 0) {
  fail(`not a usable take:\n${issues.map((issue) => `  ${issue}`).join("\n")}`);
}

const take = parsed as Take;

// A rename is the take's own `name` changing, not just the file's: the name is
// what the summary is headed with and what `--emit` calls the composition, and
// a file whose contents disagree with it is a take that reads wrong forever.
if (opts.name) {
  const slug = takeSlug(opts.name);
  if (slug !== opts.name) fail(`--name must be a slug (lowercase, hyphens): "${opts.name}"`);
  take.name = slug;
}

const takesDir = resolve(process.cwd(), TAKES_DIR);
let file: string;
try {
  file = resolveTakePath(takesDir, take.name);
} catch (err) {
  fail((err as Error).message);
}

if (existsSync(file) && !opts.force) {
  fail(`${takeRelativePath(take.name)} already exists — --force to overwrite, or --name to file it beside`);
}

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(take, null, 2)}\n`, "utf8");

const path = takeRelativePath(take.name);
console.log(`\n${summarizeTake(take)}\n`);
console.log(`  voice     ${take.instrument}${take.voice ? `/${take.voice}` : " (default)"}`);
console.log(`  played    ${new Date(take.recordedAt).toLocaleString()}`);
console.log(`  imported  ${path}`);
console.log(`            npm run take:read -- --file ${path} --emit <slug>\n`);

function readFile(path: string): string {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) fail(`no such file: ${relative(process.cwd(), full).split("\\").join("/")}`);
  return readFileSync(full, "utf8");
}
