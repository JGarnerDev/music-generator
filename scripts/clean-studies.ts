/**
 * Tear a study down once its finding is written into `docs/taste.md`.
 *
 *   npm run study:clean -- --set chorus-lift/ridge-storm        # dry run
 *   npm run study:clean -- --set chorus-lift/ridge-storm --yes  # do it
 *   npm run study:clean -- --judged --yes                       # everything answered
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * **A study is scratch.** It exists to produce one line in
 * [`docs/taste.md`](../docs/taste.md), and once that line is written the JSON
 * and the MP3s are worse than dead weight: a set sitting in the bench with a
 * verdict already distilled invites a *second* verdict on a question that has
 * been answered, and then the ledger and the rule disagree. So the loop ends
 * here, and `taste.md` is deliberately written to survive without any of this.
 *
 * Deletes for real rather than moving to a trash folder, unlike a composition —
 * a study is regenerable from its concept, axis and mood, and a composition is
 * not. That asymmetry is why this defaults to a **dry run**: it prints what
 * would go and changes nothing until `--yes`.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { planCleanup, type StudyEntry } from "../src/engine/study-library";
import { deleteStudy, readStudies, writeLedger } from "../src/dev/study-store";
import {
  indexManifest,
  mergeManifest,
  renderManifest,
  type ManifestEntry,
} from "../src/engine/manifest";

const AUDIO_DIR = resolve(process.cwd(), "public/audio/studies");

const program = new Command();
program
  .name("study:clean")
  .description("Delete studies whose finding is already written into docs/taste.md")
  .option("--set <concept/set>", "tear down one set")
  .option("--concept <slug>", "tear down every study of one concept")
  .option("--study <concept/slug>", "tear down a single attempt")
  .option("--judged", "tear down every study that has a verdict", false)
  .option("--all", "tear down everything under studies/", false)
  .option("--include-unjudged", "also delete attempts nobody thumbed", false)
  .option("--yes", "actually delete — without this it is a dry run", false)
  .parse(process.argv);

const opts = program.opts<{
  set?: string;
  concept?: string;
  study?: string;
  judged: boolean;
  all: boolean;
  includeUnjudged: boolean;
  yes: boolean;
}>();

if (!opts.set && !opts.concept && !opts.study && !opts.judged && !opts.all) {
  console.error("Nothing to clean: pass --set, --concept, --study, --judged, or --all.");
  process.exit(2);
}

const entries = readStudies();
const selected = select(entries);
if (selected.length === 0) {
  console.error("Nothing matched. Check the id with: npm run study:verdict -- --ledger");
  process.exit(1);
}

const plan = planCleanup(selected, { includeUnjudged: opts.includeUnjudged });

for (const entry of plan.unjudged) {
  console.warn(
    `  ! kept ${entry.id} — no verdict yet. ` +
      `Judge it, or pass --include-unjudged to throw the question away too.`,
  );
}

if (plan.remove.length === 0) {
  console.error("\nNothing to delete: everything selected is still waiting on a thumb.");
  process.exit(1);
}

console.log(`\n${opts.yes ? "Deleting" : "Would delete"} ${plan.remove.length} study/studies:`);
for (const { entry, audioName } of plan.remove) {
  const audio = audioFiles(audioName);
  const verdict = entry.study.verdict;
  console.log(
    `  · studies/${entry.concept}/${entry.slug}.json` +
      `${audio.length > 0 ? ` + ${audio.length} audio file(s)` : ""}` +
      `  [${verdict ? verdict.thumb : "broken"}]`,
  );
}

if (!opts.yes) {
  console.log(
    "\nDry run — nothing changed. Write the finding into docs/taste.md first, then re-run with --yes.",
  );
  console.log("The rule has to stand without these files: no ids, no set names, no filenames.");
  process.exit(0);
}

for (const { entry, audioName } of plan.remove) {
  deleteStudy(entry.id);
  for (const file of audioFiles(audioName)) rmSync(resolve(AUDIO_DIR, file), { force: true });
}
pruneManifest();
writeLedger();

console.log(`\nDeleted ${plan.remove.length} study/studies and their audio.`);
console.log(`Ledger rewritten. docs/taste.md is now the only record of what they showed.`);

/** The studies this run is about. */
function select(all: StudyEntry[]): StudyEntry[] {
  if (opts.study) return all.filter((entry) => entry.id === opts.study!.trim());
  if (opts.set) {
    const [concept, set] = opts.set.trim().split("/");
    return all.filter((entry) => entry.concept === concept && entry.study.set === set);
  }
  if (opts.concept) return all.filter((entry) => entry.concept === opts.concept!.trim());
  if (opts.judged) return all.filter((entry) => entry.study.verdict || entry.issues.length > 0);
  return all;
}

/** Rendered files for one study — the MP3, and the WAV if `--wav` ever wrote one. */
function audioFiles(audioName: string): string[] {
  if (!existsSync(AUDIO_DIR)) return [];
  return readdirSync(AUDIO_DIR).filter(
    (file) => file === `${audioName}.mp3` || file === `${audioName}.wav`,
  );
}

/**
 * Rebuild the audio manifest from what is left on disk.
 *
 * `mergeManifest` already drops entries whose file is gone, so this is the same
 * pass the render scripts make — the manifest is a description of the directory,
 * never a separate list to keep in step by hand.
 */
function pruneManifest(): void {
  const path = resolve(AUDIO_DIR, "manifest.json");
  if (!existsSync(path)) return;
  let previous: ManifestEntry[] = [];
  try {
    previous = [...indexManifest(JSON.parse(readFileSync(path, "utf8"))).values()];
  } catch {
    return;
  }
  const onDisk = new Set(readdirSync(AUDIO_DIR).filter((file) => file.endsWith(".mp3")));
  writeFileSync(path, renderManifest(mergeManifest(previous, [], onDisk)));
}
