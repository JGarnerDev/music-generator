/**
 * Render studies to audio so they can be judged by ear.
 *
 *   npm run study:render -- --all
 *   npm run study:render -- --set guitar-solo/dusty-standoff
 *   npm run study:render -- --study hook/dusty-standoff-a --force
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * Output goes to `public/audio/studies/`, with its own manifest, and the studies
 * bench (`/studies.html`) plays those files. Same rule as everywhere else here:
 * **the app synthesises nothing**, so a study you have not rendered is a study
 * you cannot judge, and one you edited sounds like its old self until you
 * re-render it with `--force`.
 *
 * Studies are eight bars by design, so a set of four costs about the same as one
 * segment — `--audition` makes that cheaper again while you are iterating on a
 * written axis.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { studyAudioName, type StudyEntry } from "../src/engine/study-library";
import { encodeMp3 } from "../src/utils/mp3";
import { encodeWav } from "../src/utils/wav";
import { defaultJobs, renderItems } from "../src/dev/render-harness";
import { readStudies } from "../src/dev/study-store";
import {
  indexManifest,
  mergeManifest,
  renderManifest,
  type ManifestEntry,
} from "../src/engine/manifest";

const OUT_DIR = resolve(process.cwd(), "public/audio/studies");

const program = new Command();
program
  .name("study:render")
  .description("Render studies to public/audio/studies/ for the studies bench")
  .option("--study <concept/slug>", "render one study, e.g. hook/dusty-standoff-a")
  .option("--set <concept/set>", "render every attempt in one set")
  .option("--concept <slug>", "render every study of one concept")
  .option("--all", "render every study under studies/")
  .option("--wav", "also write full-quality WAVs (gitignored)")
  .option("--bitrate <kbps>", "MP3 bitrate", "160")
  .option("--audition", "render at audition quality — faster, thinner (see src/app/audio/quality.ts)")
  .option("--jobs <n>", "studies to render in parallel", String(defaultJobs()))
  .option("--force", "re-render studies that already have audio")
  .parse(process.argv);

const opts = program.opts<{
  study?: string;
  set?: string;
  concept?: string;
  all?: boolean;
  wav?: boolean;
  bitrate: string;
  audition?: boolean;
  jobs: string;
  force?: boolean;
}>();

if (!opts.study && !opts.set && !opts.concept && !opts.all) {
  console.error("Nothing to do: pass --study, --set, --concept, or --all.");
  process.exit(2);
}

const bitrateKbps = Number(opts.bitrate);
if (!Number.isFinite(bitrateKbps) || bitrateKbps <= 0) {
  console.error(`--bitrate must be a positive number, got "${opts.bitrate}"`);
  process.exit(2);
}

const jobs = Number(opts.jobs);
if (!Number.isInteger(jobs) || jobs < 1) {
  console.error(`--jobs must be a positive integer, got "${opts.jobs}"`);
  process.exit(2);
}

await main();

async function main(): Promise<void> {
  const wanted = select(readStudies());
  if (wanted.length === 0) {
    console.error(
      "No studies matched. Fan out a set: " +
        'npm run study:new -- --concept <slug> --axis <axis> --mood "<scene>"',
    );
    process.exit(1);
  }

  for (const entry of wanted.filter((e) => e.issues.length > 0)) {
    console.error(`  skipped ${entry.id}: ${entry.issues[0]!.path} ${entry.issues[0]!.message}`);
  }
  // A scaffolded attempt on a written axis is the same music as its siblings
  // until someone writes the varying part. Rendering it would produce four
  // identical files and a set of verdicts about nothing.
  for (const entry of wanted.filter((e) => e.issues.length === 0 && e.study.draft)) {
    console.error(`  skipped ${entry.id}: still a draft — write the varying part, then drop "draft": true`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const previous = readPreviousManifest();
  const ready = wanted.filter((entry) => entry.issues.length === 0 && !entry.study.draft);
  const queue = plan(ready, previous);
  if (queue.length === 0) {
    console.log("Every study is already rendered. Pass --force to render again.");
    return;
  }
  console.log(`Rendering ${queue.length} study/studies, ${jobs} at a time...`);

  const fresh: ManifestEntry[] = [];
  try {
    await renderItems({
      jobs,
      items: queue,
      run: async (entry, session) => {
        const started = Date.now();
        const audio = await session.renderPcm(entry.study.composition, { audition: opts.audition });
        const written = write(entry, audio.channels, audio.sampleRate);
        fresh.push(written);
        console.log(
          `  ${entry.id} (${entry.study.axis} = ${entry.study.variant}) - ` +
            `${written.seconds.toFixed(0)}s in ${((Date.now() - started) / 1000).toFixed(0)}s`,
        );
      },
    });
  } finally {
    // In a `finally` for the same reason the other manifests are: a run that dies
    // partway must not erase the record of what already rendered.
    writeManifest(previous, fresh);
  }
}

/** The studies this run is about: one, one set, one concept, or all of them. */
function select(entries: StudyEntry[]): StudyEntry[] {
  if (opts.study) return entries.filter((entry) => entry.id === opts.study!.trim());
  if (opts.set) {
    const [concept, set] = opts.set.trim().split("/");
    return entries.filter((entry) => entry.concept === concept && entry.study.set === set);
  }
  if (opts.concept) return entries.filter((entry) => entry.concept === opts.concept!.trim());
  return entries;
}

/** Skip studies that already have audio, unless --force. */
function plan(entries: StudyEntry[], previous: ManifestEntry[]): StudyEntry[] {
  const done = new Set(previous.map((entry) => entry.name));
  return entries.filter((entry) => {
    if (opts.force) return true;
    const name = studyAudioName(entry.concept, entry.slug);
    return !(done.has(name) && existsSync(resolve(OUT_DIR, `${name}.mp3`)));
  });
}

function write(entry: StudyEntry, channels: Float32Array[], sampleRate: number): ManifestEntry {
  const name = studyAudioName(entry.concept, entry.slug);
  const mp3 = encodeMp3(channels, { sampleRate, bitrateKbps });
  writeFileSync(resolve(OUT_DIR, `${name}.mp3`), mp3);
  if (opts.wav) writeFileSync(resolve(OUT_DIR, `${name}.wav`), encodeWav({ sampleRate, channels }));
  return {
    name,
    file: `${name}.mp3`,
    seconds: (channels[0]?.length ?? 0) / sampleRate,
    bytes: mp3.length,
    isLoop: false,
    renderedAt: new Date().toISOString(),
  };
}

function readPreviousManifest(): ManifestEntry[] {
  const path = resolve(OUT_DIR, "manifest.json");
  if (!existsSync(path)) return [];
  try {
    return [...indexManifest(JSON.parse(readFileSync(path, "utf8"))).values()];
  } catch {
    return [];
  }
}

function writeManifest(previous: ManifestEntry[], fresh: ManifestEntry[]): void {
  const onDisk = new Set(readdirSync(OUT_DIR).filter((file) => file.endsWith(".mp3")));
  const entries = mergeManifest(previous, fresh, onDisk);
  writeFileSync(resolve(OUT_DIR, "manifest.json"), renderManifest(entries));
  console.log(`\nManifest lists ${entries.length} study/studies in public/audio/studies/.`);
}
