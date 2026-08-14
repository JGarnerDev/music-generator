/**
 * Probes — the short étude a voice is auditioned on.
 *
 * Every voice for an instrument is heard on the *same* material, because that is
 * the only way two sounds can be compared: play a bass tone a different riff and
 * you are judging the riff. So the probe is fixed per instrument and lives here,
 * in the engine, rather than being written per voice.
 *
 * Each étude deliberately asks the questions a tone has to answer:
 *
 * - **Attack** — does a hit read as struck, or as faded in?
 * - **Sustain and release** — what happens after the note, and does a held note
 *   keep singing or collapse?
 * - **Register** — the same gesture low and high, because a voice that is right
 *   in one octave is often mud or glass in the other.
 * - **Dynamics** — the same phrase soft and hard; a voice that ignores velocity
 *   is a voice that will flatten every arrangement it lands in.
 * - **Density** — a chord or a fast run, where a thick voice turns to porridge.
 *
 * One track only: you are judging a sound, not a mix. Pure and tested; the audio
 * comes from rendering what this returns like any other composition.
 */
import type { Composition, InstrumentName, Note, Track } from "./composition";
import type { VoicePreset } from "./voice";

export const PROBE_NAMES = ["keys", "pad", "bass", "rhythm", "lead", "kit"] as const;
export type ProbeName = (typeof PROBE_NAMES)[number];

export interface Probe {
  name: ProbeName;
  bpm: number;
  key: string;
  /** One line on what this étude is asking of the voice. Shown in the bench. */
  describe: string;
  notes: Note[];
}

/** The étude each instrument is auditioned on unless its preset names another. */
export const DEFAULT_PROBES: Record<InstrumentName, ProbeName> = {
  piano: "keys",
  epiano: "keys",
  pad: "pad",
  bass: "bass",
  pluck: "rhythm",
  lead: "lead",
  drums: "kit",
};

/** `bar:beat:sixteenth` — Tone's transport time, written once so bars stay readable. */
function at(bar: number, beat: number, sixteenth = 0): string {
  return `${bar}:${beat}:${sixteenth}`;
}

function note(time: string, pitch: string, duration: string, velocity = 0.75): Note {
  return { time, pitch, duration, velocity };
}

/** A chord: the same time and length for every pitch in it. */
function chord(time: string, pitches: string[], duration: string, velocity = 0.75): Note[] {
  return pitches.map((pitch) => note(time, pitch, duration, velocity));
}

/** A run of notes, one per step, starting at `bar:beat`. Steps are sixteenths. */
function run(
  bar: number,
  beat: number,
  pitches: string[],
  duration: string,
  velocity = 0.75,
  stride = 1,
): Note[] {
  return pitches.map((pitch, i) => {
    const step = beat * 4 + i * stride;
    return note(at(bar + Math.floor(step / 16), Math.floor((step % 16) / 4), step % 4), pitch, duration, velocity);
  });
}

/**
 * Keys, 8 bars in A minor: an arpeggio to hear the attack and the note-to-note
 * gaps, block chords for density, the same chord soft then hard for velocity
 * response, and a whole-note ending so the release tail is audible on its own.
 */
const KEYS: Probe = {
  name: "keys",
  bpm: 84,
  key: "A minor",
  describe: "Arpeggio · block chords · soft vs hard · a held ending",
  notes: [
    ...run(0, 0, ["A3", "C4", "E4", "A4", "E4", "C4", "A3", "E3"], "8n", 0.7, 2),
    ...run(1, 0, ["F3", "A3", "C4", "F4", "C4", "A3", "F3", "C3"], "8n", 0.7, 2),
    ...chord(at(2, 0), ["C4", "E4", "G4"], "4n", 0.8),
    ...chord(at(2, 2), ["G3", "B3", "D4"], "4n", 0.8),
    ...chord(at(3, 0), ["A3", "C4", "E4"], "2n", 0.85),
    // Same voicing twice: the quiet one should stay a note, not vanish.
    ...chord(at(4, 0), ["A3", "C4", "E4"], "2n", 0.25),
    ...chord(at(5, 0), ["A3", "C4", "E4"], "2n", 0.95),
    // High and low, to catch a voice that is only right in the middle octave.
    ...run(6, 0, ["A5", "G5", "E5", "C5"], "8n", 0.8, 2),
    ...run(6, 2, ["A2", "C3", "E3", "G3"], "8n", 0.8, 2),
    ...chord(at(7, 0), ["A2", "A3", "C4", "E4", "A4"], "1n", 0.8),
  ],
};

/**
 * Pad, 8 bars: four whole-note chords. Slow attacks are the whole point of a
 * pad, so this asks whether it arrives in time to be musical and whether the
 * chord change is a swell or a smear.
 */
const PAD: Probe = {
  name: "pad",
  bpm: 70,
  key: "A minor",
  describe: "Four whole-note chords — swell, overlap, and the tail after the last",
  notes: [
    ...chord(at(0, 0), ["A3", "C4", "E4"], "1n", 0.7),
    ...chord(at(1, 0), ["F3", "A3", "C4"], "1n", 0.7),
    ...chord(at(2, 0), ["C4", "E4", "G4"], "1n", 0.7),
    ...chord(at(3, 0), ["G3", "B3", "D4"], "1n", 0.7),
    // Wide voicing, barely touched: a pad's job is to hold a room without
    // filling it, and a voice that ignores velocity can't do that.
    ...chord(at(4, 0), ["A2", "E3", "A3", "C4", "E4"], "1n", 0.3),
    ...chord(at(5, 0), ["F2", "C3", "F3", "A3", "C4"], "1n", 0.3),
    ...chord(at(6, 0), ["A2", "E3", "A3", "C4", "E4"], "1n", 0.85),
  ],
};

/**
 * Bass, 8 bars: root–octave eighths for the groove, a walk for pitch definition
 * low down, sixteenths for attack separation, then a held whole note — the test
 * a synth bass usually fails, because a note that keeps its level for four beats
 * is what makes a bass sound played rather than triggered.
 */
const BASS: Probe = {
  name: "bass",
  bpm: 92,
  key: "A minor",
  describe: "Root–octave groove · a walk · sixteenths · one long held note",
  notes: [
    ...run(0, 0, ["A1", "A2", "A1", "A2", "A1", "A2", "G1", "A1"], "8n", 0.8, 2),
    ...run(1, 0, ["F1", "F2", "F1", "F2", "C2", "C2", "E2", "E1"], "8n", 0.8, 2),
    // A walk: consecutive scale tones down low, where a muddy voice smears.
    ...run(2, 0, ["A1", "B1", "C2", "D2", "E2", "F2", "G2", "A2"], "8n", 0.75, 2),
    // Sixteenths: can you still hear where each note starts?
    ...run(3, 0, ["A1", "A1", "A1", "A1", "C2", "C2", "E2", "E2"], "16n", 0.7),
    // Up an octave and a half for a fill: the register where a bass voice that
    // was tuned only for the bottom string turns thin and nasal.
    ...run(3, 2, ["A2", "C3", "E3", "A3", "G3", "E3", "C3", "A2"], "16n", 0.7),
    note(at(4, 0), "A1", "1n", 0.85),
    note(at(5, 0), "F1", "1n", 0.85),
    // Quiet, then loud, on the same note.
    note(at(6, 0), "A1", "2n", 0.3),
    note(at(6, 2), "A1", "2n", 0.95),
    note(at(7, 0), "A1", "1n", 0.8),
  ],
};

/**
 * Rhythm guitar, 8 bars: palm-mute sixteenths on the low string, power chords,
 * and an open ring-out. The chug is where a rhythm tone lives or dies — too much
 * low end going into the drive and consecutive sixteenths turn into one long
 * blur instead of a set of separate hits.
 */
const RHYTHM: Probe = {
  name: "rhythm",
  bpm: 104,
  key: "E minor",
  describe: "Palm-mute chug · power chords · gallop · open ring-out",
  notes: [
    ...run(0, 0, ["E2", "E2", "E2", "E2", "E2", "E2", "E2", "E2"], "16n", 0.85),
    ...run(0, 2, ["E2", "E2", "E2", "E2", "G2", "G2", "A2", "A2"], "16n", 0.85),
    // Gallop: the classic test of whether the attack survives the compressor.
    ...run(1, 0, ["E2", "E2", "E2"], "16n", 0.9),
    ...run(1, 1, ["E2", "E2", "E2"], "16n", 0.9),
    ...run(1, 2, ["D2", "D2", "D2"], "16n", 0.9),
    ...run(1, 3, ["C2", "C2", "C2"], "16n", 0.9),
    ...chord(at(2, 0), ["E2", "B2"], "4n", 0.9),
    ...chord(at(2, 2), ["G2", "D3"], "4n", 0.9),
    ...chord(at(3, 0), ["A2", "E3"], "2n", 0.9),
    ...chord(at(4, 0), ["C3", "G3"], "2n", 0.9),
    // Quiet chug: does it thin out, or just get quieter?
    ...run(5, 0, ["E2", "E2", "E2", "E2", "E2", "E2", "E2", "E2"], "16n", 0.4),
    ...run(5, 2, ["E2", "E2", "E2", "E2", "E2", "E2", "E2", "E2"], "16n", 0.4),
    // Open chord, left to ring: everything the palm mute was hiding.
    ...chord(at(6, 0), ["E2", "B2", "E3", "G3"], "1n", 0.9),
    // Up the neck, where the cab's roll-off decides between "guitar" and "fizz".
    ...chord(at(7, 0), ["E3", "B3"], "4n", 0.9),
    ...chord(at(7, 1), ["G3", "D4"], "4n", 0.9),
    ...chord(at(7, 2), ["A3", "E4"], "2n", 0.9),
  ],
};

/**
 * Lead guitar, 8 bars: a held note that has to keep singing, a fast run, wide
 * leaps, and a quiet-to-loud pair. Sustain is the whole question — a lead that
 * decays like a rhythm part is the "puny solo" the two voices exist to avoid.
 */
const LEAD: Probe = {
  name: "lead",
  bpm: 104,
  key: "E minor",
  describe: "Held sustain · fast run · wide leaps · soft vs hard",
  notes: [
    note(at(0, 0), "B4", "1n", 0.9),
    note(at(1, 0), "G4", "2n", 0.9),
    note(at(1, 2), "A4", "2n", 0.9),
    ...run(2, 0, ["E4", "F#4", "G4", "A4", "B4", "C5", "D5", "E5"], "16n", 0.85),
    ...run(2, 2, ["D5", "C5", "B4", "A4", "G4", "F#4", "E4", "D4"], "16n", 0.85),
    // Leaps: two octaves apart in one gesture, where a static filter shows up.
    ...run(3, 0, ["E3", "E5", "B3", "B4"], "8n", 0.9, 2),
    note(at(3, 2), "E5", "2n", 0.95),
    ...run(4, 0, ["G5", "F#5", "E5", "D5", "B4", "A4", "G4", "E4"], "16n", 0.8),
    note(at(4, 2), "E4", "2n", 0.8),
    note(at(5, 0), "B4", "1n", 0.35),
    note(at(6, 0), "B4", "1n", 1),
    note(at(7, 0), "E5", "1n", 0.9),
  ],
};

/**
 * Kit, 8 bars: a plain backbeat first, because balance is judged on the ordinary
 * bar, then every piece in turn so nothing is left un-auditioned, then a tom
 * fill and a crash. Hats and kick land together often here on purpose — that
 * overlap is where a boomy kick eats the whole top end.
 */
const KIT: Probe = {
  name: "kit",
  bpm: 92,
  key: "A minor",
  describe: "Backbeat · every piece in turn · tom fill · crash",
  notes: [
    ...backbeat(0),
    ...backbeat(1),
    ...backbeat(2, { openHat: true }),
    ...backbeat(3),
    // Each piece alone, so a level that is wrong is obvious rather than masked.
    ...run(4, 0, ["kick", "snare", "rim", "clap"], "8n", 0.9, 2),
    ...run(4, 2, ["hat", "open-hat", "ride", "shaker"], "8n", 0.9, 2),
    // Ride pattern with the backbeat under it.
    ...run(5, 0, ["ride", "ride", "ride", "ride", "ride", "ride", "ride", "ride"], "8n", 0.6, 2),
    note(at(5, 0), "kick", "4n", 0.95),
    note(at(5, 1), "snare", "4n", 0.9),
    note(at(5, 2), "kick", "4n", 0.95),
    note(at(5, 3), "snare", "4n", 0.9),
    ...backbeat(6),
    // Fill: three toms plus the snare, then the crash the fill exists to set up.
    ...run(7, 0, ["tom-hi", "tom-hi", "tom-mid", "tom-mid"], "16n", 0.85),
    ...run(7, 1, ["tom-lo", "tom-lo", "snare", "snare"], "16n", 0.85),
    note(at(7, 2), "crash", "2n", 1),
    note(at(7, 2), "kick", "4n", 1),
  ],
};

/** One ordinary bar: kick on 1 and 3, snare on 2 and 4, eighth hats over it. */
function backbeat(bar: number, opts: { openHat?: boolean } = {}): Note[] {
  const notes: Note[] = [
    note(at(bar, 0), "kick", "4n", 0.95),
    note(at(bar, 1), "snare", "4n", 0.9),
    note(at(bar, 2, 2), "kick", "4n", 0.9),
    note(at(bar, 3), "snare", "4n", 0.9),
  ];
  for (let step = 0; step < 8; step++) {
    const last = step === 7 && opts.openHat;
    notes.push(
      note(at(bar, Math.floor(step / 2), (step % 2) * 2), last ? "open-hat" : "hat", "8n", 0.55),
    );
  }
  return notes;
}

const PROBES: Record<ProbeName, Probe> = {
  keys: KEYS,
  pad: PAD,
  bass: BASS,
  rhythm: RHYTHM,
  lead: LEAD,
  kit: KIT,
};

export function isProbeName(value: unknown): value is ProbeName {
  return typeof value === "string" && value in PROBES;
}

/** The étude a preset is auditioned on: its own `probe`, else its instrument's. */
export function probeFor(preset: Pick<VoicePreset, "instrument" | "probe">): Probe {
  const name = isProbeName(preset.probe) ? preset.probe : DEFAULT_PROBES[preset.instrument];
  return PROBES[name];
}

/**
 * The probe as a one-track composition, ready for the normal render path.
 *
 * No `lofi` block on purpose: leaving it out means the render applies exactly the
 * chain defaults a composition gets when it says nothing, so what you approve is
 * what a song will actually sound like — not a drier, brighter version of it.
 */
export function probeComposition(preset: VoicePreset): Composition {
  const probe = probeFor(preset);
  const track: Track = {
    instrument: preset.instrument,
    voice: preset.slug,
    notes: probe.notes,
  };
  return {
    name: `voice-${preset.instrument}-${preset.slug}`,
    bpm: probe.bpm,
    key: probe.key,
    tracks: [track],
    tags: ["voice-probe", preset.instrument, ...(preset.tags ?? [])],
  };
}
