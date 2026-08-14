/**
 * Start a new voice, by forking one that already exists.
 *
 *   npm run voice:new -- --instrument bass --slug sub-drone --title "Sub drone"
 *   npm run voice:new -- --from lead/brown-lead --slug molten --title "Molten"
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * Always a fork, never a blank file: a preset built from nothing sounds like
 * nothing, and the fastest way to a new tone is to move two knobs on one that
 * already works. With no `--from`, it copies the instrument's current default.
 *
 * The copy lands in `draft`, remembering what it came from, so the sound you
 * already approved is never the file you are editing. Render it and listen:
 * `npm run voice:render -- --voice <instrument>/<slug>`.
 */
import { relative } from "node:path";
import { Command } from "commander";
import { fork } from "../src/dev/voice-ops";

const program = new Command();
program
  .name("new-voice")
  .description("Fork an existing voice into a new draft under voices/<instrument>/")
  .requiredOption("--slug <slug>", "kebab-case id for the new voice, e.g. sub-drone")
  .option("--from <instrument/slug>", "voice to copy, e.g. lead/brown-lead")
  .option("--instrument <name>", "fork this instrument's default (when --from is omitted)")
  .option("--title <title>", "human title; defaults to the source's, marked as a fork")
  .option("--summary <text>", "one line for the archive row — when to pick this over the parent")
  .option("--notes <text>", "why it is built this way; the fork brief, not the archive row")
  .parse(process.argv);

const opts = program.opts<{
  slug: string;
  from?: string;
  instrument?: string;
  title?: string;
  notes?: string;
  summary?: string;
}>();

if (!opts.from && !opts.instrument) {
  console.error("Pass --from <instrument>/<slug> or --instrument <name>.");
  process.exit(2);
}

try {
  const result = fork(opts);
  console.log(`Created ${relative(process.cwd(), result.path)} (draft)`);
  if (result.preset.forkedFrom) console.log(`  forked from ${result.preset.forkedFrom}`);
  console.log(`\nNext: npm run voice:render -- --voice ${result.id}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
