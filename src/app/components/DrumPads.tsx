/**
 * The drawn kit: one square per piece, lit for a moment when it is struck.
 *
 * Dumb, like [`./PianoKeys`](./PianoKeys.tsx) — which pads exist, what they are
 * called and which key hits them all come from
 * [`@engine/pads`](../../engine/pads.ts). This file decides only what a pad
 * looks like and how a finger reaches it.
 *
 * The geometry is the opposite of the keyboard's, and deliberately: a piano is
 * irregular because pitch is, and a kit is a plain grid because its pieces have
 * no order to be irregular about. Squares of equal size, four to a row, in the
 * shape every drum machine has had since the 808 — so the thing you are looking
 * for is wherever it was on the last kit.
 *
 * A pointer that slides across pads strikes each one it crosses, the way a
 * finger dragged across a hi-hat and a snare plays both. What it does *not* do
 * is re-strike the pad it is already on: the piano's slide leaves a note
 * sounding and this would stack a dozen attacks into a buzz.
 */
import { useRef } from "react";
import type { DrumPiece } from "@engine/composition";
import { PAD_COLUMNS, type DrumPad } from "@engine/pads";

export interface DrumPadsProps {
  pads: readonly DrumPad[];
  /** Pieces struck a moment ago — what lights up. */
  struck: ReadonlySet<DrumPiece>;
  onHit(piece: DrumPiece): void;
}

export function DrumPads({ pads, struck, onHit }: DrumPadsProps) {
  /** The pad each pointer is currently over, so a slide strikes each one once. */
  const over = useRef<Map<number, DrumPiece>>(new Map());

  function pieceAt(target: EventTarget | null): DrumPiece | undefined {
    const element = target as HTMLElement | null;
    const pad = element?.closest?.(".pad") as HTMLElement | null;
    return (pad?.getAttribute("data-piece") as DrumPiece | null) ?? undefined;
  }

  function strike(pointerId: number, piece: DrumPiece | undefined): void {
    if (piece === undefined || over.current.get(pointerId) === piece) return;
    over.current.set(pointerId, piece);
    onHit(piece);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    strike(event.pointerId, pieceAt(event.target));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!over.current.has(event.pointerId)) return;
    // The pointer is captured by the grid, so `event.target` is the grid rather
    // than the pad under the finger — the same reason the keyboard asks the
    // document what is at the point.
    strike(event.pointerId, pieceAt(document.elementFromPoint(event.clientX, event.clientY)));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    over.current.delete(event.pointerId);
  }

  return (
    <div
      id="pads"
      role="group"
      aria-label="Drum pads"
      style={{ "--pad-columns": Math.min(PAD_COLUMNS, pads.length) } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {pads.map((pad) => (
        <Pad key={pad.piece} pad={pad} lit={struck.has(pad.piece)} />
      ))}
    </div>
  );
}

interface PadProps {
  pad: DrumPad;
  lit: boolean;
}

function Pad({ pad, lit }: PadProps) {
  return (
    <div
      className={lit ? "pad lit" : "pad"}
      title={pad.label}
      aria-label={pad.label}
      aria-pressed={lit}
      data-piece={pad.piece}
    >
      <span className="piece">{pad.label}</span>
      {pad.keyLabel ? <span className="cap">{pad.keyLabel}</span> : null}
    </div>
  );
}
