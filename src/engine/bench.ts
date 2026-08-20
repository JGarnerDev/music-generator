/**
 * What the bench *says* about a piece: the title line, and the status line
 * under the transport.
 *
 * Pure, and separate from the components, because these strings are the bench's
 * only feedback — a piece that fails to load says why here or nowhere. Keeping
 * them out of the view means the wording can be tested without a DOM, and means
 * a validation failure and a successful load can never disagree about which
 * piece the bench is holding.
 */
import { validateComposition, type Composition } from "./composition";

export interface LoadedPiece {
  /** The piece the bench now holds, or null when the input failed validation. */
  composition: Composition | null;
  /**
   * The title line, or null to leave the previous one alone — a rejected file
   * must not blank the line describing the piece that is still selected.
   */
  title: string | null;
  status: string;
}

/** `<name> — <key> @ <bpm> BPM`, the line above the drop zone. */
export function titleOf(comp: Composition): string {
  return `${comp.name} — ${comp.key} @ ${comp.bpm} BPM`;
}

/**
 * Validate a candidate composition and describe the result.
 *
 * `source` is what to blame in the error — a library id for a bundled piece, a
 * filename for a dropped one.
 */
export function describeLoad(comp: unknown, source: string): LoadedPiece {
  const issues = validateComposition(comp);
  if (issues.length > 0) {
    return {
      composition: null,
      title: null,
      status: `Invalid ${source}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
    };
  }
  const composition = comp as Composition;
  const loop = composition.loop;
  return {
    composition,
    title: titleOf(composition),
    status: loop
      ? `Ready. Loops bars ${loop.startBar}–${loop.endBar} (${loop.endBar - loop.startBar} bars).`
      : "Ready. One-shot piece — no loop window.",
  };
}
