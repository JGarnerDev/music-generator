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

  let whitesBefore = 0;
  const placed = keys.map((key) => {
    const left = whitesBefore * share;
    if (!key.black) whitesBefore += 1;
    return { key, left };
  });

  function grab(event: React.PointerEvent<HTMLDivElement>, midi: number): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    on.onPress(midi);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (held.size === 0) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element?.classList.contains("key")) return;

    const pianoMidiAttr = element.getAttribute("data-midi");
    if (!pianoMidiAttr) return;

    const midi = parseInt(pianoMidiAttr, 10);
    if (!held.has(midi)) {
      on.onPress(midi);
    }
  }

  return (
    <div id="piano" role="group" aria-label="Keyboard" onPointerMove={handlePointerMove}>
      <div className="whites">
        {placed
          .filter(({ key }) => !key.black)
          .map(({ key }) => (
            <Key key={key.midi} pianoKey={key} held={held} scale={scale} grab={grab} {...on} />
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
            grab={grab}
            style={{ left: `${left}%`, width: `${share * 0.62}%` }}
            {...on}
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
  grab(event: React.PointerEvent<HTMLDivElement>, midi: number): void;
  onRelease(midi: number): void;
}

function Key({ pianoKey, held, scale, style, grab, onRelease }: KeyProps) {
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
      onPointerDown={(event) => grab(event, pianoKey.midi)}
      onPointerUp={() => onRelease(pianoKey.midi)}
      onPointerCancel={() => onRelease(pianoKey.midi)}
    >
      <span className="cap">{pianoKey.labels[0]}</span>
      <span className="pitch">{pianoKey.pitch}</span>
    </div>
  );
}
