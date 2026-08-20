/**
 * Render each voice's audition probe, so a sound can be heard before it is used
 * in anything.
 *
 *   npm run voice:render -- --all
 *   npm run voice:render -- --voice lead/molten --force
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * Output goes to `public/audio/voices/`, with its own manifest, and the voices
 * bench (`/voices.html`) plays those files. Same rule as compositions: **the app
 * synthesises nothing**, so a voice you have not rendered is a voice you cannot
 * hear, and a voice you edited sounds like its old self until you re-render it
 * with `--force`.
 *
 * What gets played is the instrument's étude from `@engine/probe` — the same
 * material for every voice of an instrument, because that is the only way two
 * sounds can be compared.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { probeComposition, probeFor } from "../src/engine/probe";
import { voiceAudioName, type VoiceEntry } from "../src/engine/voice-library";
import { encodeMp3 } from "../src/utils/mp3";
import { encodeWav } from "../src/utils/wav";
import { defaultJobs, renderItems } from "../src/dev/render-harness";
import { readVoices } from "../src/dev/voice-store";
import {
  indexManifest,
  mergeManifest,
  renderManifest,
  type ManifestEntry,
} from "../src/engine/manifest";

const OUT_DIR = resolve(process.cwd(), "public/audio/voices");

const program = new Command();
program
  .name("render-voices")
  .description("Render voice probes to public/audio/voices/ for the voices bench")
  .option("--voice <instrument/slug>", "render one voice, e.g. lead/molten")
  .option("--instrument <name>", "render every voice of one instrument")
  .option("--all", "render every voice under voices/")
  .option("--wav", "also write full-quality WAVs (gitignored)")
  .option("--bitrate <kbps>", "MP3 bitrate", "160")
  .option("--audition", "render at audition quality — faster, thinner (see src/app/audio/quality.ts)")
  .option("--jobs <n>", "voices to render in parallel", String(defaultJobs()))
  .option("--force", "re-render voices that already have audio")
  .parse(process.argv);

const opts = program.opts<{
  voice?: string;
  instrument?: string;
  all?: boolean;
  wav?: boolean;
  bitrate: string;
  audition?: boolean;
  jobs: string;
  force?: boolean;
}>();

if (!opts.voice && !opts.instrument && !opts.all) {
  console.error("Nothing to do: pass --voice <instrument/slug>, --instrument <name>, or --all.");
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
  const wanted = select(readVoices());
  if (wanted.length === 0) {
    console.error(`No voices matched. Add one: npm run voice:new -- --instrument <i> --slug <s>`);
    process.exit(1);
  }

  const broken = wanted.filter((entry) => entry.issues.length > 0);
  for (const entry of broken) {
    console.error(`  skipped ${entry.id}: ${entry.issues[0]!.path} ${entry.issues[0]!.message}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const previous = readPreviousManifest();
  const queue = plan(wanted.filter((entry) => entry.issues.length === 0), previous);
  if (queue.length === 0) {
    console.log("Every voice is already rendered. Pass --force to render again.");
    return;
  }
  console.log(`Rendering ${queue.length} voice probe(s), ${jobs} at a time...`);

  const fresh: ManifestEntry[] = [];
  try {
    await renderItems({
      jobs,
      items: queue,
      run: async (entry, session) => {
        const started = Date.now();
        const comp = probeComposition(entry.preset);
        const audio = await session.renderPcm(comp, { audition: opts.audition });
        const written = write(entry, audio.channels, audio.sampleRate);
        fresh.push(written);
        console.log(
          `  ${entry.id} (${probeFor(entry.preset).name}) - ${written.seconds.toFixed(0)}s in ` +
            `${((Date.now() - started) / 1000).toFixed(0)}s`,
        );
      },
    });
  } finally {
    // In a `finally` for the same reason the composition manifest is: a run that
    // dies partway must not erase the record of what already rendered.
    writeManifest(previous, fresh);
  }
}

/** The voices this run is about: one, one instrument's worth, or all of them. */
function select(entries: VoiceEntry[]): VoiceEntry[] {
  if (opts.voice) return entries.filter((entry) => entry.id === opts.voice!.trim());
  if (opts.instrument) return entries.filter((entry) => entry.instrument === opts.instrument);
  return entries;
}

/** Skip voices that already have audio, unless --force. */
function plan(entries: VoiceEntry[], previous: ManifestEntry[]): VoiceEntry[] {
  const done = new Set(previous.map((entry) => entry.name));
  return entries.filter((entry) => {
    const name = voiceAudioName(entry.instrument, entry.slug);
    if (opts.force) return true;
    return !(done.has(name) && existsSync(resolve(OUT_DIR, `${name}.mp3`)));
  });
}

function write(entry: VoiceEntry, channels: Float32Array[], sampleRate: number): ManifestEntry {
  const name = voiceAudioName(entry.instrument, entry.slug);
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
  console.log(`\nManifest lists ${entries.length} voice probe(s) in public/audio/voices/.`);
}
