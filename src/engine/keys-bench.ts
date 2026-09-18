/**
 * What the keys bench *says*, and the one decision it has to make before making
 * a sound: whether a voice can be played live at all.
 *
 * Pure and tested for the reason [`./voice-bench`](./voice-bench.ts) is — these
 * strings are the page's only feedback, and several of them are instructions.
 * "Tell Claude: recordings/keys/<name>.take.json" is the entire handoff between
 * a performance and a composition, and a path printed wrong is a take nobody
 * ever reads.
 */
import type { InstrumentName } from "./composition";
import type { VoicePreset } from "./voice";
import type { Take } from "./take";

/**
 * Whether a preset can be a live keyboard, and what to warn about if it can.
 *
 * Two hard noes, and they are the same two that decline a bend. **Drums** have
 * no pitch — a kit piece is a name, not a note, so there is nothing for a
 * keyboard to be. **Sections** are the subtler no: a desk of eight players is
 * eight synths of polyphony behind every key, which is a render-time cost being
 * asked to meet a realtime deadline, and the deadline is what loses.
 *
 * The amp warning is the measured one. `docs/rendering.md` puts ~85% of render
 * cost in the guitar chains, at 0.9x realtime for a whole arrangement — one
 * guitar under one pair of hands fits, but it is the voice most likely to
 * crackle on a busy machine, and a player who was warned reaches for the octave
 * instead of assuming the feature is broken.
 */
export interface Playability {
  playable: boolean;
  /** Why not, or what to expect. Empty when there is nothing to say. */
  note: string;
}

export function playability(preset: VoicePreset): Playability {
  if (preset.instrument === "drums") {
    return {
      playable: false,
      note: "Drums have no pitch to play — a kit piece is a name, not a note. Pick a pitched instrument.",
    };
  }
  if (preset.section) {
    return {
      playable: false,
      note: `"${preset.slug}" is a section: every key would start one synth per player, which misses the realtime deadline. Play a solo voice and arrange the section around the take.`,
    };
  }
  if (!preset.synth) {
    return { playable: false, note: `"${preset.slug}" has no synth to trigger.` };
  }
  if (preset.amp) {
    return {
      playable: true,
      note: "Amped voice — the heaviest thing here to run live. If it crackles, play fewer notes at once or pick a cleaner voice; the recorded take is unaffected either way.",
    };
  }
  return { playable: true, note: "" };
}

/**
 * The line the page opens with, before a key has been pressed.
 *
 * It says "play", not "press Start", because there is nothing to press: the
 * first key wakes the audio itself. The only thing worth warning about up front
 * is the one thing a key press cannot fix, which is a built bundle having no
 * dev server to save a take to.
 */
export function openingMessage(voices: number, canEdit: boolean): string {
  const shelf = `${voices} ${voices === 1 ? "voice" : "voices"} on the shelf`;
  return canEdit
    ? `${shelf}. Play — Z is C, Q is the octave above.`
    : `${shelf}. Read-only build: play away, but saving a take needs "npm run dev".`;
}

export function readyMessage(voiceId: string, note: string): string {
  return note ? `${voiceId} ready. ${note}` : `${voiceId} ready.`;
}

/** Recording states, in the order they happen. */
export type RecordState = "idle" | "armed" | "recording";

/**
 * Armed, waiting for the click's next downbeat.
 *
 * There is no count-in setting to report because there is no count-in: a click
 * that is already running is the count-in, and arming simply waits for its next
 * bar. With the click off there is nothing to wait for, so recording starts on
 * the spot and this is never said.
 */
export function armedMessage(bpm: number): string {
  return `Armed at ${bpm} BPM — recording starts on the next downbeat.`;
}

/** The click going on or off, which is a thing you do mid-phrase and need confirmed. */
export function clickMessage(on: boolean, bpm: number): string {
  return on ? `Click on at ${bpm} BPM.` : "Click off — recording will start the moment you press Record.";
}

export function recordingMessage(notes: number): string {
  if (notes === 0) return "Recording — nothing played yet.";
  return `Recording — ${notes} ${notes === 1 ? "note" : "notes"}.`;
}

export function stoppedMessage(notes: number): string {
  if (notes === 0) return "Stopped — nothing was played, so there is nothing to save.";
  return `Stopped — ${notes} ${notes === 1 ? "note" : "notes"}. Check the summary, then Save.`;
}

/**
 * What to say once a take is on disk.
 *
 * It ends in a path and an instruction to hand it over, because that is the
 * step the feature exists for: the performance is only useful once a composer
 * can read it, and the composer cannot hear it. Naming the CLI too means the
 * user can look at their own take without waiting on anybody.
 */
export function savedMessage(path: string): string {
  return `Saved ${path} — tell Claude that path, or read it yourself with: npm run take:read -- --file ${path}`;
}

export function saveFailedMessage(message: string): string {
  return `Could not save: ${message}`;
}

/** The header above the drawn keyboard: where the hands are, how hard, and where the pitch is. */
export function stateLine(octave: number, velocity: number, held: number, bendCents = 0): string {
  const parts = [`octave ${octave} (Z = C${octave})`, `velocity ${velocity.toFixed(1)}`];
  // Only while it is actually off the written pitch. A permanent "bend 0" reads
  // as a control that is on.
  if (Math.abs(bendCents) >= 1) {
    const semitones = bendCents / 100;
    parts.push(`bend ${semitones > 0 ? "+" : ""}${semitones.toFixed(2)} st`);
  }
  if (held > 0) parts.push(`${held} sounding`);
  return parts.join(" · ");
}

/** The control legend. One line, because it lives under the keyboard and competes with it. */
export const LEGEND =
  "← → octave · ↑ ↓ velocity · F K bend · space record · esc panic";

/** The take's filename, and the id the summary is headed with. */
export function takePath(name: string): string {
  return `recordings/keys/${name}.take.json`;
}

/**
 * The block printed above a take's summary: what it was played on and how it
 * was snapped, since both change what the notes mean.
 */
export function takeHeader(take: Take): string {
  const voice = take.voice ? `${take.instrument}/${take.voice}` : `${take.instrument} (default voice)`;
  const grid = take.grid === 4 ? "sixteenths" : take.grid === 2 ? "eighths" : "quarters";
  const held = take.monophonic ? "cut at the next onset" : "held as played";
  return `${voice} · ${grid} · ${held}`;
}

/**
 * What the Record button says.
 *
 * Three words for three states, and the middle one has to name what it is
 * waiting for: a button that says "recording" while nothing is being recorded
 * is how a player finds out afterwards that the first bar is missing.
 */
export function recordLabel(state: RecordState): string {
  return state === "idle" ? "Record" : state === "armed" ? "waiting for downbeat" : "Stop";
}

/** Instruments the keyboard can play, in the order the tabs show them. */
export function playableInstruments(all: readonly InstrumentName[]): InstrumentName[] {
  return all.filter((name) => name !== "drums");
}
