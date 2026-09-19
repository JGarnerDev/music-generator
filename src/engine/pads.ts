/**
 * The drum kit as something a pair of hands can hit: one pad per piece the kit
 * actually voices.
 *
 * A keyboard is the wrong shape for percussion, which is why
 * [`./keys-bench`](./keys-bench.ts) refuses a kit at the piano — a kit piece is
 * a *name*, not a note, so there is no low-to-high to lay out and no octave to
 * move. What a kit has instead is a handful of named sounds, and the instrument
 * that fits that is a grid: every piece on screen at once, nothing hidden
 * behind a control, and the same shape a drum machine has had since the 808.
 *
 * Pure and tested for the reason the rest of the bench layer is: which pads
 * exist is derived from the preset, and a pad drawn for a piece the kit does
 * not voice is a square that is silent when you hit it with no way to tell why.
 *
 * The grid is filled in {@link DRUM_PIECES} order rather than in the preset's
 * key order, so the kick is bottom-left on every kit on the shelf. A layout
 * that reshuffles itself per voice is one you have to re-learn each time you
 * change the sound, which is exactly the moment you were mid-groove.
 */
import { DRUM_PIECES, type DrumPiece } from "./composition";
import type { VoicePreset } from "./voice";

/** Columns in the drawn grid. Four, so twelve pieces are three even rows. */
export const PAD_COLUMNS = 4;

/**
 * The physical keys the pads sit under, in grid order.
 *
 * Three rows of four, in the block a left hand already covers, so the grid on
 * screen is the same shape as the keys under the fingers. Identified by
 * `KeyboardEvent.code` for the reason [`./keys`](./keys.ts) is: it is a shape
 * under the hand, not the letters an AZERTY board would print on it.
 */
export const PAD_CODES: readonly string[] = [
  "KeyQ", "KeyW", "KeyE", "KeyR",
  "KeyA", "KeyS", "KeyD", "KeyF",
  "KeyZ", "KeyX", "KeyC", "KeyV",
];

/** What those caps say on a US board — the label a pad prints in its corner. */
export const PAD_KEY_LABELS: readonly string[] = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];

/** One drawn pad: the piece it strikes, what it says, and the key that hits it. */
export interface DrumPad {
  piece: DrumPiece;
  /** The piece name as a human reads it — `open-hat` is an "open hat". */
  label: string;
  /** `KeyboardEvent.code` that strikes it, or nothing past the twelfth pad. */
  code?: string;
  /** The cap that key prints, to draw on the pad. */
  keyLabel?: string;
}

/** Whether a preset voices this piece at all. A pad for a silent square is worse than no pad. */
function voices(preset: VoicePreset, piece: DrumPiece): boolean {
  const kit = preset.kit;
  if (!kit) return false;
  return piece in (kit.membrane ?? {}) || piece in (kit.noise ?? {});
}

/** The pieces a kit can actually make a sound for, in canonical order. */
export function kitPieces(preset: VoicePreset): DrumPiece[] {
  return DRUM_PIECES.filter((piece) => voices(preset, piece));
}

/** `open-hat` → `open hat`. The hyphen is an id's business, not a label's. */
export function padLabel(piece: DrumPiece): string {
  return piece.replace(/-/g, " ");
}

/** The grid to draw for a kit: one pad per voiced piece, keys assigned in order. */
export function drumPads(preset: VoicePreset): DrumPad[] {
  return kitPieces(preset).map((piece, at) => ({
    piece,
    label: padLabel(piece),
    code: PAD_CODES[at],
    keyLabel: PAD_KEY_LABELS[at],
  }));
}

/**
 * Whether this voice belongs on the pads.
 *
 * The mirror of `playability`: that one answers "can a keyboard play this",
 * this one answers "is this a kit with something in it". A drums preset with no
 * kit, or a kit that voices nothing, has no pads to draw.
 */
export function padPlayable(preset: VoicePreset): boolean {
  return preset.instrument === "drums" && kitPieces(preset).length > 0;
}

/** The piece a physical key strikes on this grid, or nothing if it strikes none. */
export function padForCode(code: string, pads: readonly DrumPad[]): DrumPiece | undefined {
  return pads.find((pad) => pad.code === code)?.piece;
}

/**
 * The line under the grid, in the shape [`./keys-bench`](./keys-bench.ts)'s
 * legends are: every control named is one that is there.
 */
export function padLegend(pads: readonly DrumPad[], coarsePointer: boolean): string {
  const count = `${pads.length} ${pads.length === 1 ? "piece" : "pieces"}`;
  return coarsePointer
    ? `${count} · tap a pad`
    : `${count} · Q W E R / A S D F / Z X C V · esc panic`;
}
