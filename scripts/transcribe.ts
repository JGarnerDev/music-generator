/**
 * Turn a recorded take into notes.
 *
 *   npm run transcribe -- --file recordings/limping-waltz-hook.wav --tempo 90 --key Am
 *   npm run transcribe -- --file recordings/limping-waltz-hook.wav          # guess the tempo
 *   npm run transcribe -- --file recordings/limping-waltz-hook.wav --tempo 120 --requantize
 *   npm run transcribe -- --file recordings/limping-waltz-hook.wav --tempo 90 --mode shape
 *   npm run transcribe -- --file recordings/limping-waltz-hook.wav --tempo 90 --key Am \
 *     --emit limping-waltz-hook --confirm   # …write it, render it, and A/B it against the take
 *
 * Named flags only (repo convention: no positional arguments).
 *
 * This script is the impure half: reading the WAV, running the neural detector,
 * writing the file. Every musical decision — what counts as a note, where the
 * grid is, what degree a pitch is — lives in
 * [`src/engine/transcribe.ts`](../src/engine/transcribe.ts), where it is tested.
 *
 * **Slow.** The detector runs on tfjs's pure-JS CPU backend at roughly half
 * realtime, so a 30-second take costs about a minute. `--requantize` re-reads the
 * detector output already saved beside the WAV, which makes trying another tempo
 * or grid instant — reach for it rather than re-running the model.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { Command } from "commander";
import * as tf from "@tensorflow/tfjs";
import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from "@spotify/basic-pitch";
import { decodeWav, isRiffWave, type PcmAudio } from "../src/utils/wav";
import { downmixToMono, resample } from "../src/utils/resample";
import { COMMON_TIME, type Meter } from "../src/utils/timing";
import {
  cleanDetected,
  degreesOf,
  estimateTempo,
  formatDegree,
  parseKey,
  quantizeNotes,
  toComposition,
  toTrackNotes,
  type DetectedNote,
} from "../src/engine/transcribe";
import { confirmChecklist, summarizeTranscript } from "../src/engine/transcript";
import { encodeMp3 } from "../src/utils/mp3";
import { indexManifest, mergeManifest, renderManifest } from "../src/engine/manifest";
import { applyShape, type MelodicShape, summarizeShape, toShape } from "../src/engine/shape";
import { INSTRUMENT_NAMES, validateComposition, type InstrumentName } from "../src/engine/composition";
import { pitchToMidi } from "../src/engine/theory";

/** What the model was trained on. Not a preference — feeding it anything else garbles the pitches. */
const MODEL_SAMPLE_RATE = 22050;

/**
 * Where `--emit` may write. Not `loops` or `songs`: a take is a phrase, and a
 * loop needs a seam written on purpose (`docs/looping.md`) rather than whatever
 * bar the player happened to stop on.
 *
 * Declared up here rather than beside `planEmit` because the flag checks run
 * before the detector, which puts them above the function bodies in this file.
 */
const EMIT_KINDS = ["leitmotifs", "segments"] as const;

/** Where the bench looks for playable audio. */
const AUDIO_DIR = resolve(process.cwd(), "public/audio");

/** Sample rates lamejs will encode. Anything else has to be resampled first. */
const LAME_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);

const program = new Command();
program
  .name("transcribe")
  .description("Turn a recorded WAV into composition notes and scale degrees")
  .requiredOption("--file <path>", "the recording to transcribe (.wav)")
  .option("--tempo <bpm>", "the tempo it was played at — pass this whenever you know it")
  .option("--key <key>", "tonal centre, e.g. Am, 'D dorian' — enables scale degrees")
  .option("--meter <n/d>", "time signature", "4/4")
  .option("--mode <literal|shape>", "literal: the notes as played. shape: intervals and rhythm only", "literal")
  .option("--grid <n>", "quantize resolution in steps per beat: 4 sixteenths, 2 eighths, 1 quarters", "4")
  .option("--polyphonic", "keep overlapping notes instead of truncating each at the next onset")
  .option("--min-amplitude <0..1>", "drop notes quieter than this", "0.2")
  .option("--requantize", "reuse the saved detector output instead of re-running the model")
  .option("--out <path>", "where to write the transcription (default: beside the recording)")
  .option("--emit <slug>", "also write a playable composition, e.g. --emit lioness-hook (needs --key)")
  .option("--kind <leitmotifs|segments>", "which compositions/ folder --emit writes to", "leitmotifs")
  .option("--instrument <name>", "instrument for the emitted track", "lead")
  .option("--voice <slug>", "voice preset for the emitted track (default: the instrument's own)")
  .option("--tag <a,b,c>", "extra tags for the emitted composition")
  .option("--root <pitch>", "with --mode shape: re-root the shape here, e.g. D4")
  .option("--force", "overwrite an existing composition at --emit")
  .option("--confirm", "with --emit: render it and put the take beside it in the bench to A/B")
  .parse(process.argv);

const opts = program.opts<{
  file: string;
  tempo?: string;
  key?: string;
  meter: string;
  mode: string;
  grid: string;
  polyphonic?: boolean;
  minAmplitude: string;
  requantize?: boolean;
  out?: string;
  emit?: string;
  kind: string;
  instrument: string;
  voice?: string;
  tag?: string;
  root?: string;
  force?: boolean;
  confirm?: boolean;
}>();

const wavPath = resolve(process.cwd(), opts.file);
if (!existsSync(wavPath)) fail(`no such file: ${opts.file}`);

const outPath = opts.out
  ? resolve(process.cwd(), opts.out)
  : join(dirname(wavPath), `${basename(wavPath).replace(/\.[^.]+$/, "")}.notes.json`);

const meter = parseMeter(opts.meter);
const mode = parseMode(opts.mode);
const grid = parseGrid(opts.grid);
const key = opts.key ? parseKey(opts.key) : undefined;
const minAmplitude = Number(opts.minAmplitude);
if (!(minAmplitude >= 0 && minAmplitude <= 1)) fail(`--min-amplitude must be 0..1, got ${opts.minAmplitude}`);

// Checked before the model runs, not after: every one of these is a typo, and a
// typo that surfaces a minute into a transcription costs that minute twice.
const emit = opts.emit === undefined ? undefined : planEmit(opts.emit);
if (opts.confirm && !emit) fail("--confirm needs --emit: there has to be a composition to render and listen to");

/** What gets written beside the recording — and what `--requantize` reads back. */
interface Transcription {
  source: string;
  bpm: number;
  bpmSource: "given" | "estimated";
  /** Only meaningful when the tempo was estimated. */
  confidence?: number;
  key?: string;
  meter: Meter;
  grid: number;
  durationSeconds: number;
  /** Degrees in playing order, e.g. `["1", "b3", "5", "b7"]`. Present when `--key` was given. */
  degrees?: string[];
  notes: ReturnType<typeof toTrackNotes>;
  /**
   * Intervals and rhythm with the pitch and tempo taken out. Written by
   * `--mode shape`, and the field to reach for when the take is a demonstration
   * of a gesture rather than a part to quote — `applyShape` roots it wherever the
   * piece needs and snaps it into that piece's key.
   */
  shape?: MelodicShape;
  /**
   * The detector's raw output, kept so the take can be re-quantized at another
   * tempo without paying for the model again. This is the expensive part of the
   * file, and the reason it is worth committing.
   */
  detected: DetectedNote[];
}

const detected = opts.requantize ? loadDetected() : await runDetector();
if (detected.length === 0) {
  fail(
    "no notes detected. Check the take is not silent, and that it was played clean — " +
      "see recordings/readme.md for what makes a take legible.",
  );
}

const cleaned = cleanDetected(detected, { minAmplitude });
const onsets = cleaned.map((n) => n.startSeconds);

let bpm: number;
let bpmSource: "given" | "estimated";
let confidence: number | undefined;
if (opts.tempo) {
  bpm = Number(opts.tempo);
  if (!(bpm > 0)) fail(`--tempo must be a positive number, got ${opts.tempo}`);
  bpmSource = "given";
} else {
  const estimate = estimateTempo(onsets);
  if (!estimate) fail("too few notes to guess a tempo — pass --tempo");
  bpm = estimate.bpm;
  confidence = Math.round(estimate.confidence * 100) / 100;
  bpmSource = "estimated";
}

const quantized = quantizeNotes(cleaned, { bpm, meter, grid, monophonic: !opts.polyphonic });
const notes = toTrackNotes(quantized, meter, key);
const degrees = key ? degreesOf(quantized.map((n) => n.midi), key).map(formatDegree) : undefined;

const transcription: Transcription = {
  source: opts.file.replace(/\\/g, "/"),
  bpm,
  bpmSource,
  ...(confidence === undefined ? {} : { confidence }),
  ...(key ? { key: `${key.tonic} ${key.mode}` } : {}),
  meter,
  grid,
  durationSeconds: round(Math.max(...detected.map((n) => n.startSeconds + n.durationSeconds)), 2),
  ...(degrees ? { degrees } : {}),
  notes,
  ...(mode === "shape" ? { shape: toShape(quantized) } : {}),
  detected: detected.map((n) => ({
    midi: n.midi,
    startSeconds: round(n.startSeconds, 4),
    durationSeconds: round(n.durationSeconds, 4),
    amplitude: round(n.amplitude, 3),
  })),
};

writeFileSync(outPath, `${JSON.stringify(transcription, null, 2)}\n`);

if (emit) writeComposition(emit);
if (emit && opts.confirm) confirm(emit);

report();

// ── the impure parts ────────────────────────────────────────────────────────

/**
 * Run the detector over the recording.
 *
 * The WAV is decoded, summed to mono and resampled here rather than by an audio
 * API because there isn't one — Node has no `AudioContext`, which is why
 * `src/utils/wav.ts` and `src/utils/resample.ts` exist.
 */
async function runDetector(): Promise<DetectedNote[]> {
  const audio = readAudio();
  process.stderr.write(`transcribing ${opts.file} — ${audio.length / MODEL_SAMPLE_RATE < 60 ? "" : "this will take a while, "}0%`);

  const basicPitch = new BasicPitch(tf.loadGraphModel(modelFromDisk()));
  const frames: number[][] = [];
  const onsetFrames: number[][] = [];
  const contours: number[][] = [];
  await basicPitch.evaluateModel(
    audio,
    (f, o, c) => {
      frames.push(...f);
      onsetFrames.push(...o);
      contours.push(...c);
    },
    (percent) => process.stderr.write(`\rtranscribing ${opts.file} — ${Math.round(percent * 100)}%`),
  );
  process.stderr.write("\r\x1b[K");

  // The three thresholds are basic-pitch's own defaults: onset confidence, frame
  // confidence, and the minimum note length in frames.
  const events = noteFramesToTime(
    addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsetFrames, 0.5, 0.3, 5)),
  );
  return events.map((e) => ({
    midi: e.pitchMidi,
    startSeconds: e.startTimeSeconds,
    durationSeconds: e.durationSeconds,
    amplitude: e.amplitude,
  }));
}

/**
 * Decode the WAV to the one thing the model accepts: mono, 22050 Hz, floats.
 *
 * The two ways this fails need different advice, so they are told apart rather
 * than reported as one "could not read" — a wrong container is a conversion and a
 * wrong codec is a re-export, and neither is guessable from "not a RIFF/WAVE file".
 */
function readAudio(): Float32Array {
  const audio = decodeTake();
  const mono = downmixToMono(audio.channels);
  if (mono.length === 0) fail(`${opts.file} contains no audio`);
  return resample(mono, audio.sampleRate, MODEL_SAMPLE_RATE);
}

/** The recording, decoded — shared by the detector and by the bench copy. */
function decodeTake(): PcmAudio {
  const bytes = readFileSync(wavPath);
  const stem = opts.file.replace(/\.[^.]*$/, "");
  if (!isRiffWave(bytes)) {
    fail(
      `${opts.file} is not a WAV. Only RIFF/WAVE is decoded here — there is no mp3, m4a, FLAC or AIFF reader.\n` +
        `Convert it first:\n  ffmpeg -i ${opts.file} -c:a pcm_s16le ${stem}.wav`,
    );
  }
  try {
    return decodeWav(bytes);
  } catch (err) {
    fail(
      `could not read ${opts.file}: ${(err as Error).message}\n` +
        "It is a WAV, but not one of the encodings this reads: PCM at 8/16/24/32-bit, or float at 32/64-bit.\n" +
        `Re-export it as plain PCM:\n  ffmpeg -i ${opts.file} -c:a pcm_s16le ${stem}-pcm.wav`,
    );
  }
}

/**
 * Load the packaged model off disk.
 *
 * tfjs in Node has no `file://` loader — that lives in `@tensorflow/tfjs-node`,
 * which is a native build we don't want — so the model is handed over through a
 * hand-rolled `IOHandler` instead. The weights ship as one or more shards that
 * have to arrive as a single contiguous buffer, in manifest order.
 */
function modelFromDisk(): tf.io.IOHandler {
  const require = createRequire(import.meta.url);
  const dir = join(dirname(require.resolve("@spotify/basic-pitch/package.json")), "model");

  return {
    async load() {
      const manifest = JSON.parse(readFileSync(join(dir, "model.json"), "utf8"));
      const specs: tf.io.WeightsManifestEntry[] = [];
      const shards: Uint8Array[] = [];
      for (const group of manifest.weightsManifest) {
        specs.push(...group.weights);
        for (const path of group.paths) shards.push(new Uint8Array(readFileSync(join(dir, path))));
      }
      const weightData = new Uint8Array(shards.reduce((sum, s) => sum + s.byteLength, 0));
      let at = 0;
      for (const shard of shards) {
        weightData.set(shard, at);
        at += shard.byteLength;
      }
      return {
        modelTopology: manifest.modelTopology,
        weightSpecs: specs,
        weightData: weightData.buffer,
        format: manifest.format,
        generatedBy: manifest.generatedBy,
        convertedBy: manifest.convertedBy,
        signature: manifest.signature,
      };
    },
  };
}

function loadDetected(): DetectedNote[] {
  if (!existsSync(outPath)) {
    fail(`--requantize needs a previous transcription at ${outPath}; run without it first`);
  }
  const prior = JSON.parse(readFileSync(outPath, "utf8")) as Partial<Transcription>;
  if (!Array.isArray(prior.detected)) fail(`${outPath} has no saved detector output to requantize`);
  return prior.detected;
}

// ── emitting a composition ──────────────────────────────────────────────────

/** Everything `--emit` needs, resolved and checked while it is still cheap to fail. */
interface EmitPlan {
  slug: string;
  path: string;
  instrument: InstrumentName;
  voice?: string;
  tags: string[];
  /** With `--mode shape`: the pitch the shape gets rooted on. */
  rootMidi?: number;
}

function planEmit(slug: string): EmitPlan {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    fail(`--emit must be a lowercase slug like lioness-hook, got "${slug}"`);
  }
  // The key is what turns pitches into an idea rather than an accident of tuning,
  // and `Composition.key` has to say something true, so it is not optional here.
  if (!key) fail("--emit needs --key: a composition has to name the key it is in");
  if (!(EMIT_KINDS as readonly string[]).includes(opts.kind)) {
    fail(`--kind must be one of ${EMIT_KINDS.join(", ")}, got "${opts.kind}"`);
  }
  if (!(INSTRUMENT_NAMES as readonly string[]).includes(opts.instrument) || opts.instrument === "drums") {
    fail(`--instrument must be a pitched instrument (${INSTRUMENT_NAMES.filter((i) => i !== "drums").join(", ")}), got "${opts.instrument}"`);
  }

  let rootMidi: number | undefined;
  if (opts.root !== undefined) {
    if (mode !== "shape") fail("--root only means something with --mode shape; without it the pitches are the take's own");
    try {
      rootMidi = pitchToMidi(opts.root);
    } catch {
      fail(`--root must be a pitch like D4, got "${opts.root}"`);
    }
  }

  const path = resolve(process.cwd(), "compositions", opts.kind, `${slug}.json`);
  if (existsSync(path) && !opts.force) fail(`${relative(path)} exists — pass --force to overwrite it`);

  return {
    slug,
    path,
    instrument: opts.instrument as InstrumentName,
    ...(opts.voice ? { voice: opts.voice } : {}),
    // `transcribed` is provenance worth keeping: it says the notes came from a
    // performance, so the odd unquantizable length is a player, not a mistake.
    tags: ["transcribed", ...(opts.tag ?? "").split(",").map((t) => t.trim()).filter(Boolean)],
    ...(rootMidi === undefined ? {} : { rootMidi }),
  };
}

function writeComposition(plan: EmitPlan): void {
  // `key` is non-null here — `planEmit` refuses to build a plan without it.
  const inKey = key!;
  const notes =
    plan.rootMidi === undefined
      ? quantized
      : applyShape(toShape(quantized), { rootMidi: plan.rootMidi, key: inKey });

  const composition = toComposition(notes, {
    name: plan.slug,
    bpm,
    key: inKey,
    meter,
    instrument: plan.instrument,
    ...(plan.voice ? { voice: plan.voice } : {}),
    tags: plan.tags,
  });

  const issues = validateComposition(composition);
  if (issues.length > 0) {
    fail(`the transcription did not make a valid composition:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`);
  }
  writeFileSync(plan.path, `${JSON.stringify(composition, null, 2)}\n`);
}

// ── the confirm loop ────────────────────────────────────────────────────────

/**
 * Render the transcription and stand the original take next to it in the bench.
 *
 * The transcription cannot be checked from this side of the pipe. I cannot hear
 * the recording *or* the render, so "is this right?" is a question only the user
 * can answer, and the cheapest way to ask it is two rows in the same player: the
 * piece, and the take it came from, one click apart.
 *
 * Rendered at audition quality on purpose — this is a correctness check, and the
 * difference between an audition render and a full one is fidelity, not notes.
 */
function confirm(plan: EmitPlan): void {
  const file = relative(plan.path);
  process.stderr.write(`rendering ${file} to listen back…\n`);
  // Straight to the render script through tsx, not `npm run render`: npm on
  // Windows is a `.cmd`, which Node refuses to spawn without a shell, and a shell
  // would concatenate these arguments unescaped — one of them is a path the user
  // supplied. This spawns node with tsx's own CLI, which is what the npm script
  // does anyway, minus the shell.
  const require = createRequire(import.meta.url);
  const render = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), "scripts/render.ts", "--file", file, "--force", "--audition"],
    { stdio: "inherit" },
  );
  if (render.status !== 0) {
    fail(`render failed — the composition is written, so fix that and run:\n  npm run render -- --file ${file} --force`);
  }
  copyTakeToBench(plan);
}

/**
 * Put the recording itself in `public/audio/` as `<slug>.take.mp3`.
 *
 * The bench plays what the manifest lists, and the manifest is a description of
 * that folder — so the take has to physically be there. It goes in as an MP3 at
 * the same bitrate as everything else because the comparison is about notes, not
 * fidelity, and a 30 MB WAV in `public/` would be committed forever.
 */
function copyTakeToBench(plan: EmitPlan): void {
  const audio = decodeTake();
  // Lame only accepts a fixed set of rates, and takes off a phone or an interface
  // land on all sorts. Anything unexpected is resampled rather than refused.
  const rate = LAME_RATES.has(audio.sampleRate) ? audio.sampleRate : 44100;
  const channels = (audio.channels.length > 2 ? [downmixToMono(audio.channels)] : audio.channels).map((c) =>
    rate === audio.sampleRate ? c : resample(c, audio.sampleRate, rate),
  );

  const name = `${plan.slug}.take`;
  const mp3 = encodeMp3(channels, { sampleRate: rate, bitrateKbps: 160 });
  mkdirSync(AUDIO_DIR, { recursive: true });
  writeFileSync(join(AUDIO_DIR, `${name}.mp3`), mp3);

  const manifestPath = join(AUDIO_DIR, "manifest.json");
  const previous = existsSync(manifestPath)
    ? [...indexManifest(JSON.parse(readFileSync(manifestPath, "utf8"))).values()]
    : [];
  const entry = {
    name,
    file: `${name}.mp3`,
    seconds: (channels[0]?.length ?? 0) / rate,
    bytes: mp3.length,
    isLoop: false,
    renderedAt: new Date().toISOString(),
  };
  const onDisk = new Set(readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".mp3")));
  writeFileSync(manifestPath, renderManifest(mergeManifest(previous, [entry], onDisk)));
}

// ── reporting ───────────────────────────────────────────────────────────────

function report(): void {
  const name = basename(wavPath).replace(/\.[^.]+$/, "");
  console.log(
    mode === "shape"
      ? summarizeShape({ name, meter, shape: toShape(quantized) })
      : summarizeTranscript({ name, bpm, meter, key, notes: quantized }),
  );
  console.log("");
  // The tempo still matters in shape mode even though it is not printed: it is
  // what decides which step each onset landed on, so a bad guess is a wrong rhythm.
  if (bpmSource === "estimated") {
    console.log(`  tempo     guessed at ${bpm} BPM, confidence ${confidence}`);
    if ((confidence ?? 0) < 0.6) {
      console.log("            shaky — pass --tempo with --requantize to fix it without re-running the model");
    }
  }
  if (!key && mode !== "shape") {
    console.log("  key       not given — pass --key for scale degrees, which is what makes the idea transposable");
  }
  console.log(`  written   ${relative(outPath)}`);
  if (emit) console.log(`  emitted   ${relative(emit.path)}`);
  if (emit && !opts.confirm) {
    console.log(`            npm run render -- --file ${relative(emit.path)}   # or re-run with --confirm`);
  }
  if (emit && opts.confirm) {
    console.log(`  bench     ${emit.slug}.take.mp3 — the recording itself, to play against it`);
    console.log("");
    console.log(
      confirmChecklist({
        slug: emit.slug,
        takeName: `${emit.slug}.take`,
        bpm,
        bpmSource,
        ...(confidence === undefined ? {} : { confidence }),
        grid,
        minAmplitude,
        mode,
        hasKey: Boolean(key),
      }),
    );
  }
}


// ── flag parsing ────────────────────────────────────────────────────────────

function parseMeter(text: string): Meter {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(text.trim());
  if (!m) fail(`--meter must look like 4/4, got "${text}"`);
  const meter: Meter = [Number(m[1]), Number(m[2])];
  if (meter[0] < 1 || meter[1] < 1) fail(`--meter must be positive, got "${text}"`);
  return meter;
}

function parseMode(text: string): "literal" | "shape" {
  const value = text.trim().toLowerCase();
  if (value !== "literal" && value !== "shape") fail(`--mode must be literal or shape, got "${text}"`);
  return value;
}

function parseGrid(text: string): 1 | 2 | 4 {
  const n = Number(text);
  if (n !== 1 && n !== 2 && n !== 4) fail(`--grid must be 1, 2 or 4, got "${text}"`);
  return n;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function relative(path: string): string {
  return path.replace(`${process.cwd()}\\`, "").replace(`${process.cwd()}/`, "").replace(/\\/g, "/");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
