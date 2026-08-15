/**
 * Find the pairs of voices that will converge.
 *
 *   npm run voice:check
 *   npm run voice:check -- --instrument pad
 *   npm run voice:check -- --drafts
 *   npm run voice:check -- --explain pad/string-bed,pad/mens-choir
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * `docs/voices.md`: **two voices separated only by EQ will converge.** That rule
 * was learned from `pad/string-bed` and `pad/mens-choir`, and it is easy to
 * restate and hard to *apply*, because applying it means holding thirty-six
 * pairs in your head at once and knowing which of forty numbers matter. This
 * does the holding. The classification lives in `src/engine/voice-distance.ts`,
 * pure and tested; this file is the shelf-reading and the printing.
 *
 * It is a nudge, not a gate — same standing as `song:build`'s defaults report.
 * A flagged pair is a pair worth auditioning back to back, not a bug: the check
 * cannot hear a −6 dB notch, and a deep enough one is a real separation the doc
 * explicitly recommends. What it can do is tell you which two probes to open.
 */
import { Command } from "commander";
import { compareVoices, convergedPairs } from "../src/engine/voice-distance";
import { isInstrumentName, type VoiceEntry } from "../src/engine/voice-library";
import { readVoices } from "../src/dev/voice-store";

const program = new Command();
program
  .name("check-voices")
  .description("Report voices of the same instrument that differ only in EQ")
  .option("--instrument <name>", "only check this instrument, e.g. pad")
  .option("--drafts", "include voices that have not been approved yet")
  .option("--explain <a,b>", "instead: print every difference between two voices")
  .parse(process.argv);

const opts = program.opts<{ instrument?: string; drafts?: boolean; explain?: string }>();

const all = readVoices();
if (all.length === 0) {
  console.error("No voices found under voices/.");
  process.exit(2);
}

if (opts.explain) explain(opts.explain);
else report();

/**
 * The whole shelf, filtered. Drafts are out by default for the same reason
 * `voice:find` leaves them out: a draft is allowed to be a near-duplicate on its
 * way to being something, and flagging it every time would train you to ignore
 * the report. `--drafts` is what you run while designing the fork.
 */
function shelf(): VoiceEntry[] {
  let entries = all;
  if (opts.instrument) {
    if (!isInstrumentName(opts.instrument)) {
      console.error(`--instrument: "${opts.instrument}" is not an instrument`);
      process.exit(2);
    }
    entries = entries.filter((e) => e.instrument === opts.instrument);
  }
  if (!opts.drafts) entries = entries.filter((e) => e.preset.status === "approved");
  return entries;
}

function report(): void {
  const entries = shelf();
  const pairs = convergedPairs(entries.map((e) => e.preset));

  const scope = opts.instrument ? `${opts.instrument} ` : "";
  const kind = opts.drafts ? "voice" : "approved voice";
  console.log(`Checked ${entries.length} ${scope}${kind}(s) for pairs that differ only in EQ.\n`);

  if (pairs.length === 0) {
    console.log("None — every pair is separated in time, pitch or a second sound source.");
    return;
  }

  for (const pair of pairs) {
    const axes = pair.differences.map((d) => d.axis).join(", ");
    console.log(`  ${pair.a}  ~  ${pair.b}`);
    console.log(`    nothing audible; differ in: ${axes || "nothing at all — duplicates"}`);
  }
  console.log(
    `\n${pairs.length} pair(s) to audition back to back at /voices.html.` +
      "\nFixes, in ascending order of reliability (docs/voices.md): state the resonances" +
      "\nloudly and prefer a deep notch; change `breath`, since a slow follower is a swell" +
      "\nand a fast one is a scrape; separate them in time with `tremolo`, which nothing" +
      "\nerodes. Fine if deliberate — but say so in the `notes`.",
  );
}

/** Every difference between two named voices, weak ones marked. The design view. */
function explain(spec: string): void {
  const ids = spec.split(",").map((s) => s.trim());
  if (ids.length !== 2) {
    console.error(`--explain: want two ids separated by a comma, got ${JSON.stringify(spec)}`);
    process.exit(2);
  }
  const found = ids.map((id) => {
    const entry = all.find((e) => e.id === id);
    if (!entry) {
      console.error(`--explain: no voice "${id}"`);
      process.exit(2);
    }
    return entry;
  });

  const [a, b] = found as [VoiceEntry, VoiceEntry];
  if (a.preset.instrument !== b.preset.instrument) {
    console.error(`--explain: ${a.id} and ${b.id} are different instruments — nothing to compare`);
    process.exit(2);
  }

  const result = compareVoices(a.preset, b.preset);
  console.log(`${result.a}  vs  ${result.b}\n`);
  if (result.differences.length === 0) {
    console.log("  identical — these are duplicates of each other");
    return;
  }
  for (const d of result.differences) {
    const mark = d.audible ? "▲" : "·";
    const why = d.audible ? "" : d.kind === "weak" ? "  (eroded by the chain)" : "  (too small)";
    console.log(`  ${mark} ${d.axis}: ${JSON.stringify(d.a)} → ${JSON.stringify(d.b)}${why}`);
  }
  console.log(
    "\n▲ audible after the lo-fi chain · not" +
      `\n${result.converged ? "CONVERGED — nothing here survives to the speaker." : "Separated."}`,
  );
}
