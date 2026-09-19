/**
 * The drawn keyboard: two and a bit octaves, lit where a note is sounding.
 *
 * Dumb, like the other tables here — which keys exist, what they are called and
 * which belong to the key signature all come from
 * [`@engine/keys`](../../engine/keys.ts). This file decides only what a key
 * looks like and where the black ones sit.
 *
 * The layout is the one piece of real geometry. White keys are a flex row of
 * equal shares; black keys are absolutely positioned at the boundary *between*
 * two whites, at `whitesBefore × share`, which is the only way to get the
 * irregular two-then-three grouping that makes a keyboard readable at a glance.
 * Laying them out as a plain chromatic row would be simpler and would stop
 * looking like a piano, which is the entire point of drawing one.
 */
import { useRef } from "react";
import type { PianoKey } from "@engine/keys";

export interface PianoKeysProps {
  keys: readonly PianoKey[];
  /** Pitches currently sounding. */
  held: ReadonlySet<number>;
  /** Pitch classes of the take's key signature — shaded, never enforced. */
  scale?: ReadonlySet<number>;
  onPress(midi: number): void;
  onRelease(midi: number): void;
}

export function PianoKeys({ keys, held, scale, ...on }: PianoKeysProps) {
  const whites = keys.filter((key) => !key.black);
  const share = 100 / Math.max(1, whites.length);
  const activePointersRef = useRef<Map<number, Set<number>>>(new Map());

  let whitesBefore = 0;
  const placed = keys.map((key) => {
    const left = whitesBefore * share;
    if (!key.black) whitesBefore += 1;
    return { key, left };
  });

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    const element = event.target as HTMLElement;
    if (!element.classList.contains("key")) return;

    const midi = parseInt(element.getAttribute("data-midi") || "0", 10);
    const pointerId = event.pointerId;

    if (!activePointersRef.current.has(pointerId)) {
      activePointersRef.current.set(pointerId, new Set());
    }

    const keysForPointer = activePointersRef.current.get(pointerId)!;
    if (!keysForPointer.has(midi)) {
      keysForPointer.add(midi);
      on.onPress(midi);
    }

    event.currentTarget.setPointerCapture(pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const pointerId = event.pointerId;
    const keysForPointer = activePointersRef.current.get(pointerId);
    if (!keysForPointer || keysForPointer.size === 0) return;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element?.classList.contains("key")) return;

    const midi = parseInt(element.getAttribute("data-midi") || "0", 10);

    // For single pointer: release old key, press new (slide behavior)
    // For multi-pointer: keep all keys (chord behavior)
    const isSinglePointer = activePointersRef.current.size === 1;

    if (!keysForPointer.has(midi)) {
      if (isSinglePointer) {
        // Single pointer: release all previous keys for this pointer
        keysForPointer.forEach((oldMidi) => {
          on.onRelease(oldMidi);
        });
        keysForPointer.clear();
      }

      keysForPointer.add(midi);
      on.onPress(midi);
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const pointerId = event.pointerId;
    const keysForPointer = activePointersRef.current.get(pointerId);
    if (!keysForPointer) return;

    keysForPointer.forEach((midi) => {
      on.onRelease(midi);
    });

    activePointersRef.current.delete(pointerId);
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLDivElement>): void {
    const pointerId = event.pointerId;
    const keysForPointer = activePointersRef.current.get(pointerId);
    if (keysForPointer) {
      keysForPointer.forEach((midi) => {
        on.onRelease(midi);
      });
      activePointersRef.current.delete(pointerId);
    }
  }

  return (
    <div
      id="piano"
      role="group"
      aria-label="Keyboard"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerUp}
    >
      <div className="whites">
        {placed
          .filter(({ key }) => !key.black)
          .map(({ key }) => (
            <Key key={key.midi} pianoKey={key} held={held} scale={scale} />
          ))}
      </div>
      {placed
        .filter(({ key }) => key.black)
        .map(({ key, left }) => (
          <Key
            key={key.midi}
            pianoKey={key}
            held={held}
            scale={scale}
            style={{ left: `${left}%`, width: `${share * 0.62}%` }}
          />
        ))}
    </div>
  );
}

interface KeyProps {
  pianoKey: PianoKey;
  held: ReadonlySet<number>;
  scale?: ReadonlySet<number>;
  style?: React.CSSProperties;
}

function Key({ pianoKey, held, scale, style }: KeyProps) {
  const down = held.has(pianoKey.midi);
  // Out of key is what gets marked, not in: most notes played are in the scale,
  // so shading those would shade the whole keyboard and say nothing.
  const outside = scale && !scale.has(((pianoKey.midi % 12) + 12) % 12);
  const className = [
    "key",
    pianoKey.black ? "black" : "white",
    down ? "down" : "",
    outside ? "outside" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={style}
      title={pianoKey.pitch}
      aria-label={pianoKey.pitch}
      aria-pressed={down}
      data-midi={pianoKey.midi}
    >
      <span className="cap">{pianoKey.labels[0]}</span>
      <span className="pitch">{pianoKey.pitch}</span>
    </div>
  );
}
