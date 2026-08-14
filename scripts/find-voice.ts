/**
 * Find a voice without reading the whole archive.
 *
 *   npm run voice:find -- --query "spaghetti western trumpet"
 *   npm run voice:find -- --instrument lead
 *   npm run voice:find -- --tags spaghetti-western,section
 *   npm run voice:find -- --brief pad/string-bed
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * `voices/archive.md` is the index and is meant to be read; this is the same
 * index filtered, for when the answer is four rows and reading forty would be
 * the only cost. It reads the JSON files directly, so it is never stale the way
 * a generated file can be between an edit and a re-approve.
 *
 * `--brief` is the other half: one voice's design notes and the fork chain
 * above it, which is what you want *before forking* and never want while
 * choosing. That prose is deliberately absent from the archive — see
 * `VoicePreset.notes`.
 */
import { Command } from "commander";
import {
  findVoices,
  isInstrumentName,
  lineageOf,
  voiceSummary,
  type VoiceEntry,
} from "../src/engine/voice-library";
import { readVoices } from "../src/dev/voice-store";

const program = new Command();
program
  .name("find-voice")
  .description("Search approved voices by scene, instrument or tag — the archive, filtered")
  .option("--query <text>", "free text; terms are alternatives and more matches ranks higher")
  .option("--instrument <name>", "only this instrument, e.g. lead")
  .option("--tags <a,b,c>", "only voices carrying every one of these tags")
  .option("--drafts", "include voices that have not been approved yet")
  .option("--limit <n>", "how many rows to print (default 12)", "12")
  .option("--brief <instrument/slug>", "instead: print one voice's fork chain and design notes")
  .parse(process.argv);

const opts = program.opts<{
  query?: string;
  instrument?: string;
  tags?: string;
  drafts?: boolean;
  limit: string;
  brief?: string;
}>();

const entries = readVoices();

if (opts.brief) {
  printBrief(opts.brief);
} else {
  printMatches();
}

/** The picking view: one row per voice, id and tags over the summary. */
function printMatches(): void {
  if (opts.instrument && !isInstrumentName(opts.instrument)) {
    console.error(`unknown instrument "${opts.instrument}"`);
    process.exit(2);
  }
  const limit = Number.parseInt(opts.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    console.error(`--limit must be a positive number, got "${opts.limit}"`);
    process.exit(2);
  }

  const matches = findVoices(entries, {
    instrument: isInstrumentName(opts.instrument) ? opts.instrument : undefined,
    tags: opts.tags?.split(","),
    query: opts.query,
    includeDrafts: opts.drafts,
  });

  if (matches.length === 0) {
    console.log("No voice matches. Widen it, or read voices/archive.md for the whole shelf.");
    // Not an error: "nothing western yet" is an answer, and often the prompt to
    // fork one.
    return;
  }

  for (const { entry } of matches.slice(0, limit)) {
    const flags = [entry.preset.default ? "default" : "", entry.preset.status === "approved" ? "" : entry.preset.status]
      .filter(Boolean)
      .join(" ");
    console.log(`${entry.id}${flags ? `  (${flags})` : ""}  ${(entry.preset.tags ?? []).join(" ")}`);
    console.log(`  ${voiceSummary(entry.preset)}`);
  }
  if (matches.length > limit) {
    console.log(`\n… ${matches.length - limit} more. Narrow it, or raise --limit.`);
  }
}

/** The forking view: the chain this voice came out of, then why it is built so. */
function printBrief(id: string): void {
  const chain = lineageOf(entries, id.trim());
  if (chain.length === 0) {
    console.error(`no such voice: ${id.trim()} — try npm run voice:find -- --query "${id.trim()}"`);
    process.exit(1);
  }
  const voice = chain.at(-1)!;

  console.log(`${voice.preset.title ?? voice.slug} — ${voice.id} (${voice.preset.status})`);
  console.log(`tags: ${(voice.preset.tags ?? []).join(" ") || "—"}`);
  console.log(`summary: ${voiceSummary(voice.preset)}`);
  if (chain.length > 1) {
    console.log(`\nforked from: ${chain.slice(0, -1).map((e) => e.id).join(" → ")}`);
    console.log("  a fork's notes are written against its parent's — read up the chain if this one assumes something");
  }
  console.log(`\n${describe(voice)}`);
  console.log(`\nfile: voices/${voice.instrument}/${voice.slug}.json`);
}

function describe(entry: VoiceEntry): string {
  return entry.preset.notes?.trim() ?? "No notes yet — nothing recorded about why this one is built the way it is.";
}
