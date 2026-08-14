/**
 * Render bench — dev-only, never in the built bundle.
 *
 * Playback got slow and then got stuck, twice, and both times the cause was
 * guessed at rather than measured. This measures. Each run reports the two
 * phases separately, because they have opposite fixes:
 *
 * - **build** — constructing the graph and walking the transport clock, on the
 *   main thread, in JS. Slow here means too many scheduled events, and the fix
 *   is to render in smaller chunks.
 * - **render** — `startRendering()`, native DSP. Slow here means the graph
 *   itself is too expensive, and the fix is a cheaper graph (or a lower
 *   audition sample rate). Chunking would not help at all.
 *
 * The variants strip the graph down one part at a time. A variant that renders
 * much faster than `full` names the culprit.
 */
import * as Tone from "tone";
import type { Composition } from "@engine/composition";
import { scheduleComposition } from "@app/graph";
import {
  AUDITION_QUALITY,
  EXPORT_QUALITY,
  withQuality,
  type RenderQuality,
} from "@app/quality";
import shredout from "../../compositions/loops/six-gun-shredout.json";
import vulture from "../../compositions/loops/vulture-mile.json";

const SLICE_SECONDS = 10;

const els = {
  run: document.querySelector<HTMLButtonElement>("#run")!,
  runProfiles: document.querySelector<HTMLButtonElement>("#runProfiles")!,
  runFull: document.querySelector<HTMLButtonElement>("#runFull")!,
  status: document.querySelector<HTMLElement>("#status")!,
  rows: document.querySelector<HTMLElement>("#results tbody")!,
};

interface Variant {
  name: string;
  notes: string;
  apply: (comp: Composition) => Composition;
}

const withoutTracks = (comp: Composition, drop: string[]): Composition => ({
  ...comp,
  tracks: comp.tracks.filter((t) => !drop.includes(t.instrument)),
});

const VARIANTS: Variant[] = [
  { name: "full", notes: "as authored", apply: (c) => c },
  {
    name: "no reverb",
    notes: "convolver bypassed",
    apply: (c) => ({ ...c, lofi: { ...c.lofi, reverb: 0 } }),
  },
  {
    name: "no guitars",
    notes: "drops both amp chains",
    apply: (c) => withoutTracks(c, ["pluck", "lead"]),
  },
  {
    name: "no drums",
    notes: "drops the kit",
    apply: (c) => withoutTracks(c, ["drums"]),
  },
  {
    name: "drums only",
    notes: "kit alone",
    apply: (c) => ({ ...c, tracks: c.tracks.filter((t) => t.instrument === "drums") }),
  },
  {
    name: "one note",
    notes: "graph cost with nothing played",
    apply: (c) => ({ ...c, tracks: c.tracks.map((t) => ({ ...t, notes: t.notes.slice(0, 1) })) }),
  },
];

/**
 * The audition profile, and each of its knobs in isolation, so the win can be
 * attributed rather than assumed.
 */
const PROFILES: { quality: RenderQuality; notes: string }[] = [
  { quality: EXPORT_QUALITY, notes: "baseline — what Export uses" },
  {
    quality: { ...EXPORT_QUALITY, name: "22 kHz", sampleRate: 22050 },
    notes: "half the samples, same graph",
  },
  {
    quality: { ...EXPORT_QUALITY, name: "single osc", singleOscillator: true },
    notes: "one saw per voice, not 2–3",
  },
  {
    quality: { ...EXPORT_QUALITY, name: "no oversample", oversample: "none" },
    notes: "preamp waveshaper at 1×",
  },
  {
    quality: { ...EXPORT_QUALITY, name: "polyphony 8", maxPolyphony: 8 },
    notes: "half the always-running voices",
  },
  {
    quality: { ...EXPORT_QUALITY, name: "polyphony 4", maxPolyphony: 4 },
    notes: "will drop notes — cost probe only",
  },
  { quality: AUDITION_QUALITY, notes: "what Play uses" },
  {
    quality: { ...AUDITION_QUALITY, name: "audition + poly 8", maxPolyphony: 8 },
    notes: "audition with the voice cap too",
  },
];

interface Timing {
  buildMs: number;
  renderMs: number;
  audioSeconds: number;
}

/**
 * One render, phases timed separately. Deliberately mirrors `app/render.ts`:
 * same graph builder, same synchronous clock walk, so a number here is a number
 * about the real thing.
 */
async function timeRender(
  comp: Composition,
  seconds: number,
  quality: RenderQuality = EXPORT_QUALITY,
): Promise<Timing> {
  const original = Tone.getContext();
  const context = new Tone.OfflineContext(
    2,
    seconds,
    quality.sampleRate ?? original.sampleRate,
  );
  Tone.setContext(context);

  const buildStart = performance.now();
  let rendering: Promise<Tone.ToneAudioBuffer>;
  try {
    withQuality(quality, () => {
      scheduleComposition(comp);
      context.transport.start(0, 0);
    });
    rendering = context.render(false);
  } finally {
    Tone.setContext(original);
  }
  // `render(false)` walks the clock synchronously before handing off to the
  // native renderer, so the await below is the DSP and the time up to it is JS.
  const buildMs = performance.now() - buildStart;

  const renderStart = performance.now();
  const buffer = await rendering;
  return {
    buildMs,
    renderMs: performance.now() - renderStart,
    audioSeconds: buffer.duration,
  };
}

function addRow(run: string, timing: Timing, notes: string): void {
  const wall = (timing.buildMs + timing.renderMs) / 1000;
  const speed = timing.audioSeconds / wall;
  const row = document.createElement("tr");
  const cells = [
    run,
    `${timing.audioSeconds.toFixed(1)}s`,
    `${timing.buildMs.toFixed(0)}ms`,
    `${timing.renderMs.toFixed(0)}ms`,
    `${speed.toFixed(1)}×`,
    notes,
  ];
  cells.forEach((text, i) => {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (i === 4) cell.className = speed < 2 ? "slow" : "fast";
    row.appendChild(cell);
  });
  els.rows.appendChild(row);
}

/** Yield long enough for the browser to paint the row we just added. */
function paint(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
}

async function runBench(): Promise<void> {
  setBusy(true);
  for (const [label, piece] of [
    ["shredout", shredout],
    ["vulture", vulture],
  ] as [string, Composition][]) {
    for (const variant of VARIANTS) {
      els.status.textContent = `Rendering ${label} — ${variant.name}…`;
      await paint();
      const timing = await timeRender(variant.apply(piece), SLICE_SECONDS);
      addRow(`${label} — ${variant.name}`, timing, variant.notes);
      await paint();
    }
  }
  els.status.textContent = "Done.";
  setBusy(false);
}

async function runProfiles(): Promise<void> {
  setBusy(true);
  for (const { quality, notes } of PROFILES) {
    els.status.textContent = `Rendering shredout — ${quality.name}…`;
    await paint();
    const timing = await timeRender(shredout as Composition, SLICE_SECONDS, quality);
    addRow(`shredout — ${quality.name}`, timing, notes);
    await paint();
  }
  els.status.textContent = "Done.";
  setBusy(false);
}

async function runFull(): Promise<void> {
  setBusy(true);
  els.status.textContent = "Rendering six-gun-shredout in full — the page will freeze…";
  await paint();
  const timing = await timeRender(shredout as Composition, 120);
  addRow("shredout — full length", timing, "what Play actually does");
  els.status.textContent = "Done.";
  setBusy(false);
}

function setBusy(busy: boolean): void {
  for (const button of [els.run, els.runProfiles, els.runFull]) button.disabled = busy;
}

els.run.addEventListener("click", () => void runBench());
els.runProfiles.addEventListener("click", () => void runProfiles());
els.runFull.addEventListener("click", () => void runFull());
