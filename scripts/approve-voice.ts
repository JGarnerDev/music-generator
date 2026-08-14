/**
 * Approve a voice — the sound is one we keep — and rewrite `voices/archive.md`.
 *
 *   npm run voice:approve -- --voice lead/molten
 *   npm run voice:approve -- --voice lead/molten --default
 *   npm run voice:approve -- --voice lead/molten --draft   # send it back
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * Approving is a decision, not a build step: it stamps the date, puts the voice
 * in the archive Claude reads when choosing sounds for a new piece, and marks
 * the point after which the agreement is to **fork rather than edit** — so a
 * song that names this voice keeps meaning what it meant. `--default` also makes
 * it what tracks get when they name no voice, demoting whatever held that spot.
 *
 * Same operation the Approve button in `/voices.html` performs; both go through
 * `src/dev/voice-ops.ts`.
 */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Command } from "commander";
import { voiceAudioName } from "../src/engine/voice-library";
import { approve, unapprove } from "../src/dev/voice-ops";
import { writeArchive } from "../src/dev/voice-store";

const program = new Command();
program
  .name("approve-voice")
  .description("Mark a voice approved (or back to draft) and regenerate voices/archive.md")
  .option("--voice <instrument/slug>", "the voice to approve, e.g. lead/molten")
  .option("--default", "also make it the instrument's default voice")
  .option("--summary <text>", "the archive row — one line, when to pick this over its neighbours")
  .option("--notes <text>", "replace the notes — why it is built this way (the fork brief)")
  .option("--draft", "the opposite: send an approved voice back to the workbench")
  .option("--rebuild-archive", "just regenerate voices/archive.md from what is on disk")
  .parse(process.argv);

const opts = program.opts<{
  voice?: string;
  default?: boolean;
  summary?: string;
  notes?: string;
  draft?: boolean;
  rebuildArchive?: boolean;
}>();

if (!opts.voice && !opts.rebuildArchive) {
  console.error("Nothing to do: pass --voice <instrument>/<slug> or --rebuild-archive.");
  process.exit(2);
}

try {
  if (opts.rebuildArchive && !opts.voice) {
    // The JSON is the source of truth; this is for after a hand edit changed a
    // status or a note without going through approve.
    writeArchive();
  } else if (opts.draft) {
    const result = unapprove(opts.voice!);
    console.log(`${result.id} is a draft again (${relative(process.cwd(), result.path)})`);
  } else {
    const result = approve(opts.voice!, {
      makeDefault: opts.default,
      notes: opts.notes,
      summary: opts.summary,
    });
    console.log(`Approved ${result.id} on ${result.preset.approvedAt}`);
    for (const id of result.demoted) console.log(`  ${id} is no longer the default`);
    if (!result.preset.summary) {
      // Without one the archive salvages a truncated sentence from the notes,
      // which is legible but is nobody's idea of how to choose a sound.
      console.log("  no summary — add one with --summary so the archive row says when to pick it");
    }
    if (!result.preset.notes) {
      console.log("  no notes — add some with --notes so a future fork knows what it is working from");
    }
    // An approved voice nobody can hear is a claim, not a decision.
    const audio = resolve(
      process.cwd(),
      "public/audio/voices",
      `${voiceAudioName(result.preset.instrument, result.preset.slug)}.mp3`,
    );
    if (!existsSync(audio)) {
      console.log(`  no probe rendered yet: npm run voice:render -- --voice ${result.id}`);
    }
  }
  console.log("Rewrote voices/archive.md");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
