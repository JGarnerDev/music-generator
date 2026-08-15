/**
 * Render compositions to audio files the app can just play.
 *
 *   npm run render -- --all
 *   npm run render -- --file compositions/loops/six-gun-shredout.json
 *   npm run render -- --all --wav          # also write full-quality WAVs
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * Output goes to `public/audio/`, which Vite serves at `/audio/` in dev and
 * copies into `dist/` on build — so a rendered piece is playable the moment the
 * page loads, with nothing rendered in the browser ever again.
 *
 * The Vite + headless Chromium machinery lives in
 * [`src/dev/render-harness.ts`](../src/dev/render-harness.ts), which
 * `render-voices.ts` shares; this script is the composition-shaped half —
 * which files to render, and what to write out.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Command } from "commander";
import { glob } from "node:fs/promises";
import { validateComposition, type Composition } from "../src/engine/composition";
import { encodeMp3 } from "../src/utils/mp3";
import { encodeWav } from "../src/utils/wav";
import { defaultJobs, renderItems } from "../src/dev/render-harness";
import {
  indexManifest,
  mergeManifest,
  missingOutputs,
  renderManifest,
  type ManifestEntry,
} from "../src/engine/manifest";

const OUT_DIR = resolve(process.cwd(), "public/audio");

const program = new Command();
program
  .name("render")
  .description("Render compositions to public/audio/ so the app can play them instantly")
  .option("--file <path>", "render one composition")
  .option("--all", "render every composition in compositions/")
  .option("--wav", "also write full-quality WAVs (gitignored)")
  .option("--bitrate <kbps>", "MP3 bitrate", "160")
  .option(
    "--audition",
    "render at audition quality — ~2.3x faster, 22 kHz, thinner guitars (see src/app/quality.ts)",
  )
  .option("--jobs <n>", "pieces to render in parallel", String(defaultJobs()))
  .option("--force", "re-render pieces that already have audio")
  .parse(process.argv);

const opts = program.opts<{
  file?: string;
  all?: boolean;
  wav?: boolean;
  bitrate: string;
  audition?: boolean;
  jobs: string;
  force?: boolean;
}>();
if (!opts.file && !opts.all) {
  console.error("Nothing to do: pass --file <path> or --all.");
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

interface Job {
  comp: Composition;
  name: string;
  loopOnly: boolean;
}

async function main(): Promise<void> {
  const files = opts.file ? [resolve(process.cwd(), opts.file)] : await findCompositions();
  if (files.length === 0) {
    console.error("No compositions found under compositions/.");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const previous = readPreviousManifest();
  const { queue, skipped } = plan(files, previous);
  if (queue.length === 0 && skipped.length === 0) {
    console.log("Everything is already rendered. Pass --force to render it again.");
    return;
  }

  let crash: Error | null = null;
  if (queue.length > 0) {
    console.log(`Rendering ${queue.length} file(s), ${jobs} at a time...`);
    const fresh: ManifestEntry[] = [];
    try {
      await renderItems({
        jobs,
        items: queue,
        run: async (job, session) => {
          const started = Date.now();
          const audio = await session.renderPcm(job.comp, {
            loopOnly: job.loopOnly,
            audition: opts.audition,
          });
          const entry = write(job.name, audio.channels, audio.sampleRate, job.loopOnly);
          fresh.push(entry);
          console.log(
            `  ${job.name} - ${entry.seconds.toFixed(0)}s of audio in ` +
              `${((Date.now() - started) / 1000).toFixed(0)}s`,
          );
        },
      });
    } catch (err) {
      // Held rather than rethrown so the manifest still gets written and the
      // summary below can name *everything* that went wrong, not just the first.
      crash = err as Error;
    } finally {
      // Written in `finally` so a crash keeps whatever finished: a full library is
      // tens of minutes of rendering to lose.
      writeManifest(previous, fresh);
    }
  }

  report(queue, skipped, crash);
}

/**
 * Say whether the run did what it was asked, and exit non-zero when it didn't.
 *
 * The check is against the audio directory rather than against the run's own
 * bookkeeping, because the ways a render fails are not all catchable: a piece
 * that skipped validation never reached the renderer, and a process killed by a
 * timeout or a shell teardown never reached a `catch` at all. What is on disk
 * afterwards is the only account of the run that is always true.
 */
function report(queue: Job[], skipped: string[], crash: Error | null): void {
  const missing = missingOutputs(queue.map((job) => job.name), audioSizes());
  if (!crash && skipped.length === 0 && missing.length === 0) {
    console.log(`Rendered ${queue.length} file(s) to public/audio/.`);
    return;
  }

  console.error("\nRENDER FAILED:");
  if (crash) console.error(`  · rendering threw: ${crash.message}`);
  for (const file of skipped) console.error(`  · not a renderable composition: ${file}`);
  for (const name of missing) {
    console.error(`  · ${name}.mp3 was not written (or is truncated) — nothing to play`);
  }
  process.exit(1);
}

/** Size in bytes of every MP3 in the audio directory, by filename. */
function audioSizes(): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith(".mp3")) sizes.set(file, statSync(resolve(OUT_DIR, file)).size);
  }
  return sizes;
}

/**
 * Which renders are needed — both flavours per piece, minus what already exists —
 * and which files could not be read at all. A skipped file is reported rather
 * than dropped: `--file` naming something unparseable is a failed run, not an
 * empty one.
 */
function plan(files: string[], previous: ManifestEntry[]): { queue: Job[]; skipped: string[] } {
  const done = new Set(previous.map((entry) => entry.name));
  const queue: Job[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const comp = load(file);
    if (!comp) {
      skipped.push(file);
      continue;
    }
    for (const loopOnly of comp.loop ? [false, true] : [false]) {
      const name = loopOnly ? `${comp.name}.loop` : comp.name;
      if (!opts.force && done.has(name) && existsSync(resolve(OUT_DIR, `${name}.mp3`))) continue;
      queue.push({ comp, name, loopOnly });
    }
  }
  return { queue, skipped };
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

/** Manifest = what is on disk, so a partial run still describes a playable library. */
function writeManifest(previous: ManifestEntry[], fresh: ManifestEntry[]): void {
  const onDisk = new Set(readdirSync(OUT_DIR).filter((file) => file.endsWith(".mp3")));
  const entries = mergeManifest(previous, fresh, onDisk);
  writeFileSync(resolve(OUT_DIR, "manifest.json"), renderManifest(entries));
  console.log(`\nManifest lists ${entries.length} playable file(s) in public/audio/.`);
}

/** Encode and write one rendered piece, returning its manifest entry. */
function write(
  name: string,
  channels: Float32Array[],
  sampleRate: number,
  isLoop: boolean,
): ManifestEntry {
  const mp3 = encodeMp3(channels, { sampleRate, bitrateKbps });
  writeFileSync(resolve(OUT_DIR, `${name}.mp3`), mp3);
  if (opts.wav) writeFileSync(resolve(OUT_DIR, `${name}.wav`), encodeWav({ sampleRate, channels }));

  return {
    name,
    file: `${name}.mp3`,
    seconds: (channels[0]?.length ?? 0) / sampleRate,
    bytes: mp3.length,
    isLoop,
    renderedAt: new Date().toISOString(),
  };
}

function load(file: string): Composition | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`  skipped ${basename(file)}: ${(err as Error).message}`);
    return null;
  }
  const issues = validateComposition(parsed);
  if (issues.length > 0) {
    console.error(`  skipped ${basename(file)}: ${issues[0]!.path} ${issues[0]!.message}`);
    return null;
  }
  return parsed as Composition;
}

async function findCompositions(): Promise<string[]> {
  const found: string[] = [];
  for await (const file of glob("compositions/**/*.json")) {
    if (!file.includes("_trash")) found.push(resolve(process.cwd(), file));
  }
  return found.sort();
}
