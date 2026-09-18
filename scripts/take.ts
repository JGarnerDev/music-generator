/**
 * Read a keyboard take, and turn it into a piece.
 *
 *   npm run take:read -- --list
 *   npm run take:read -- --file recordings/keys/tavern-hook.take.json
 *   npm run take:read -- --file recordings/keys/tavern-hook.take.json --grid 2 --one-line
 *   npm run take:read -- --file recordings/keys/tavern-hook.take.json --key "D dorian"
 *   npm run take:read -- --file recordings/keys/tavern-hook.take.json \
 *     --emit tavern-hook --instrument lead --voice molten
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * The counterpart to [`./transcribe.ts`](./transcribe.ts), and deliberately a
 * tenth its size. That script's bulk is the detector and the arguing with it; a
 * take arrives already exact, so all that is left is reading it out and, if the
 * phrase is worth keeping, writing it into `compositions/`.
 *
 * `--grid` and `--one-line` re-read the notes that are already on disk. They
 * cannot recover what quantizing threw away — the take was snapped when it was
 * saved — so they are for a second opinion on a take, and the place to change
 * the grid properly is the bench, before saving.
 *
 * `--key` is the other kind of second opinion, and the one most often needed.
 * The bench asks for no key and infers it from the notes, which is right about
 * the *notes* and can be wrong about which end of a relative pair is home — A
 * minor and C major contain exactly the same seven. The summary names the
 * alternative for precisely this reason; this flag is how you take it.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Command } from "commander";
import { INSTRUMENT_NAMES, validateComposition, type InstrumentName } from "../src/engine/composition";
import { summarizeTake, takeToComposition, validateTake, type Take } from "../src/engine/take";
import { TAKES_DIR, isTakeFile } from "../src/dev/take-store";
import { parseKey, quantizeNotes } from "../src/engine/transcribe";

/**
 * Where `--emit` may write. The same two folders `transcribe --emit` allows, for
 * the same reason: a take is a phrase, so it is a leitmotif or a segment, never
 * a loop or a song.
 */
const EMIT_KINDS = ["leitmotifs", "segments"] as const;

const program = new Command();
program
  .name("take:read")
  .description("read a keyboard take, and optionally write it into compositions/")
  .option("--file <path>", "the take to read, e.g. recordings/keys/tavern-hook.take.json")
  .option("--list", "list the takes on disk and stop")
  .option("--grid <n>", "re-read on a coarser grid: 4 sixteenths, 2 eighths, 1 quarters")
  .option("--one-line", "re-read with every note cut at the next onset (a melody, not chords)")
  .option("--key <key>", "read the notes against this key instead of the one the take carries")
  .option("--emit <slug>", "write a playable composition, e.g. --emit tavern-hook")
  .option("--kind <leitmotifs|segments>", "which compositions/ folder --emit writes to", "leitmotifs")
  .option("--instrument <name>", "instrument for the emitted track (default: the one it was played on)")
  .option("--voice <slug>", "voice for the emitted track (default: the one it was played on)")
  .option("--tag <a,b,c>", "extra tags for the emitted composition")
  .option("--force", "overwrite an existing composition at --emit")
  .parse();

const opts = program.opts<{
  file?: string;
  list?: boolean;
  grid?: string;
  oneLine?: boolean;
  key?: string;
  emit?: string;
  kind: string;
  instrument?: string;
  voice?: string;
  tag?: string;
  force?: boolean;
}>();

function fail(message: string): never {
  console.error(`take:read: ${message}`);
  process.exit(1);
}

const takesDir = resolve(process.cwd(), TAKES_DIR);

if (opts.list) {
  listTakes();
  process.exit(0);
}

if (!opts.file) fail("--file is required (or --list to see what is on disk)");

const takePath = resolve(process.cwd(), opts.file);
if (!existsSync(takePath)) fail(`no such take: ${opts.file}`);

const take = readTake(takePath);
const reread = applyReread(take);

console.log(`\n${summarizeTake(reread)}\n`);
console.log(`  voice     ${reread.instrument}${reread.voice ? `/${reread.voice}` : " (default)"}`);
console.log(`  recorded  ${new Date(reread.recordedAt).toLocaleString()}`);

if (opts.emit) {
  const path = emit(reread, opts.emit);
  console.log(`  emitted   ${relative(process.cwd(), path).split("\\").join("/")}`);
  console.log(`            npm run render -- --file ${relative(process.cwd(), path).split("\\").join("/")}`);
}
console.log("");

/** Every take on the shelf, newest first — the answer to "what did I play?". */
function listTakes(): void {
  if (!existsSync(takesDir)) {
    console.log(`\nNo takes yet. Record one at /keys.html (npm run dev).\n`);
    return;
  }
  const files = readdirSync(takesDir).filter(isTakeFile);
  if (files.length === 0) {
    console.log(`\nNo takes yet. Record one at /keys.html (npm run dev).\n`);
    return;
  }
  const rows = files
    .map((file) => readTake(join(takesDir, file)))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  console.log("");
  for (const row of rows) {
    const when = row.recordedAt.slice(0, 10);
    console.log(
      `  ${row.name.padEnd(24)} ${String(row.notes.length).padStart(4)} notes  ${String(row.bpm).padStart(3)} BPM  ${row.key.padEnd(10)} ${when}`,
    );
  }
  console.log(`\n  ${rows.length} take${rows.length === 1 ? "" : "s"} in ${TAKES_DIR}/\n`);
}

function readTake(path: string): Take {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`${relative(process.cwd(), path)} is not JSON: ${(err as Error).message}`);
  }
  const issues = validateTake(parsed);
  if (issues.length > 0) {
    fail(`${relative(process.cwd(), path)} is not a usable take:\n${issues.map((i) => `  ${i}`).join("\n")}`);
  }
  return parsed as Take;
}

/**
 * A second reading of the same notes.
 *
 * Coarsening a grid is honest — sixteenths contain eighths. Going the other way
 * is not, and it is not offered: the notes on disk were snapped once, and
 * nothing here can put back a sixteenth that was rounded onto a quarter.
 */
function applyReread(original: Take): Take {
  const grid = opts.grid === undefined ? original.grid : Number(opts.grid);
  if (grid !== 1 && grid !== 2 && grid !== 4) fail(`--grid must be 4, 2 or 1, got "${opts.grid}"`);
  if (grid > original.grid) {
    fail(`this take was saved on a ${gridName(original.grid)} grid; --grid ${grid} cannot recover what that rounded off`);
  }
  const monophonic = opts.oneLine ?? original.monophonic;

  // A stated key replaces a guessed one outright, and stops being flagged as a
  // guess: somebody who played the take has now said what it is in.
  let rekeyed = original;
  if (opts.key !== undefined) {
    try {
      parseKey(opts.key);
    } catch (err) {
      fail((err as Error).message);
    }
    rekeyed = { ...original, key: opts.key, keyGuessed: undefined };
  }

  if (grid === rekeyed.grid && monophonic === rekeyed.monophonic) return rekeyed;
  const source = rekeyed;

  // Steps back to seconds, through the same quantizer, at the new resolution.
  // Bends are dropped by this path: they are expressed as a fraction of a note
  // whose length is about to change, and silently re-hanging them on notes of a
  // different length is how a bend ends up somewhere nobody played it.
  const sixteenth = 60 / source.bpm / 4;
  const detected = source.notes.map((note) => ({
    midi: note.midi,
    startSeconds: note.step * sixteenth,
    durationSeconds: note.lengthSteps * sixteenth,
    amplitude: note.velocity,
  }));
  return {
    ...source,
    grid,
    monophonic,
    notes: quantizeNotes(detected, {
      bpm: source.bpm,
      meter: source.meter,
      grid,
      offsetSeconds: 0,
      monophonic,
    }),
  };
}

function gridName(grid: number): string {
  return grid === 4 ? "sixteenth" : grid === 2 ? "eighth" : "quarter";
}

function emit(source: Take, slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    fail(`--emit must be a lowercase slug like tavern-hook, got "${slug}"`);
  }
  if (!(EMIT_KINDS as readonly string[]).includes(opts.kind)) {
    fail(`--kind must be one of ${EMIT_KINDS.join(", ")}, got "${opts.kind}"`);
  }
  const instrument = opts.instrument ?? source.instrument;
  if (!(INSTRUMENT_NAMES as readonly string[]).includes(instrument) || instrument === "drums") {
    const pitched = INSTRUMENT_NAMES.filter((name) => name !== "drums").join(", ");
    fail(`--instrument must be a pitched instrument (${pitched}), got "${instrument}"`);
  }

  const path = resolve(process.cwd(), "compositions", opts.kind, `${slug}.json`);
  if (existsSync(path) && !opts.force) {
    fail(`${relative(process.cwd(), path)} exists — pass --force to overwrite it`);
  }

  const composition = takeToComposition(source, {
    name: slug,
    instrument: instrument as InstrumentName,
    // No voice fallback here: `takeToComposition` drops the take's own voice
    // when the instrument changes, because a voice belongs to one instrument.
    voice: opts.voice,
    // `played` is provenance worth keeping: it says a human performed these
    // note lengths, so the odd unquantizable one is a player, not a mistake.
    tags: ["played", ...(opts.tag ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)],
  });

  const issues = validateComposition(composition);
  if (issues.length > 0) {
    fail(`the take did not make a valid composition:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`);
  }
  writeFileSync(path, `${JSON.stringify(composition, null, 2)}\n`);
  return path;
}
