/**
 * Play a leitmotif inside another piece — transposed into its key, placed at a
 * bar, mixed under what is already there:
 *   npm run motif:quote -- --into compositions/loops/throne-room.json \
 *       --motif ashen-king --at-bar 24
 *
 * The `motifs:` field on its own is provenance: it records that a theme belongs
 * here without putting it here. This writes the notes, and adds the slug to
 * `motifs` so the link and the sound agree.
 *
 * Named flags only (repo convention: no positional arguments).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { quoteMotif } from "../src/engine/motif";
import { meterOf } from "../src/engine/arrange";
import { validateComposition, type Composition, type Track } from "../src/engine/composition";

const program = new Command();
program
  .name("quote-motif")
  .description("Write a leitmotif into a host composition, in the host's key")
  .requiredOption("--into <path>", "the host composition .json")
  .requiredOption("--motif <slug>", "slug of a compositions/leitmotifs/*.json")
  .requiredOption("--at-bar <n>", "bar of the host the quote starts on", Number)
  .option("--octave <n>", "octaves to shift the quote (-1 quotes it darker)", Number, 0)
  .option("--intensity <n>", "scale the quote's velocities; it sits under the host", Number, 0.8)
  .option("--dry-run", "print what would be written and change nothing", false)
  .parse(process.argv);

const opts = program.opts<{
  into: string;
  motif: string;
  atBar: number;
  octave: number;
  intensity: number;
  dryRun: boolean;
}>();

if (!Number.isInteger(opts.atBar) || opts.atBar < 0) {
  console.error(`--at-bar must be a non-negative whole bar, got ${opts.atBar}`);
  process.exit(2);
}

const hostPath = resolve(process.cwd(), opts.into);
const motifPath = resolve(process.cwd(), `compositions/leitmotifs/${opts.motif}.json`);
const host = readComposition(hostPath, "--into");
const motif = readComposition(motifPath, `--motif "${opts.motif}"`);

const quoted = quoteMotif(motif, {
  atBar: opts.atBar,
  key: host.key,
  meter: meterOf(host),
  octaveShift: opts.octave * 12,
  intensity: opts.intensity,
});
if (quoted.length === 0) {
  console.error(`${opts.motif} has no melodic track to quote — a kit is not a theme.`);
  process.exit(1);
}

// Merged into the host's existing tracks by instrument rather than appended as
// new ones: a second `piano` track is a second piano in the mix, and a quote is
// meant to be the same instrument saying something familiar.
const tracks = mergeTracks(host.tracks, quoted);
const updated: Composition = {
  ...host,
  tracks,
  motifs: [...new Set([...(host.motifs ?? []), opts.motif])],
};

const issues = validateComposition(updated);
if (issues.length > 0) {
  console.error(`Quoting produced an invalid composition (${issues.length} issue(s)):`);
  for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
  process.exit(1);
}

const noteCount = quoted.reduce((n, t) => n + t.notes.length, 0);
const lastBar = Math.max(...quoted.flatMap((t) => t.notes.map((n) => Number(n.time.split(":")[0]))));
console.log(
  `${opts.motif} → ${host.name}: ${noteCount} notes on ${quoted.map((t) => t.instrument).join(", ")}, ` +
    `bars ${opts.atBar}–${lastBar}, in ${host.key}.`,
);

if (opts.dryRun) {
  console.log("--dry-run: nothing written.");
  process.exit(0);
}

writeFileSync(hostPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
console.log(`Wrote ${opts.into}.`);
console.log(`Re-render it: npm run render -- --file ${opts.into} --force`);

/** Add quoted notes to the host's track for that instrument, or start a new one. */
function mergeTracks(host: Track[], quoted: Track[]): Track[] {
  const out = host.map((t) => ({ ...t, notes: [...t.notes] }));
  for (const track of quoted) {
    const existing = out.find((t) => t.instrument === track.instrument && t.voice === track.voice);
    if (existing) {
      existing.notes.push(...track.notes);
      // Keep each track's notes in time order; the renderer doesn't care, but a
      // human reading the JSON does.
      existing.notes.sort((a, b) => a.time.localeCompare(b.time, "en", { numeric: true }));
    } else {
      out.push(track);
    }
  }
  return out;
}

function readComposition(path: string, label: string): Composition {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Composition;
  } catch (err) {
    console.error(`Could not read ${label} at ${path}: ${(err as Error).message}`);
    return process.exit(2);
  }
}
