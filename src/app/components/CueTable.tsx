/**
 * The running order: key · play · name+note · length · loop · move · remove.
 *
 * One rule here is not shared with the composition bench. A cue that cannot play
 * is never quietly greyed and left at that — the row goes `bad`, and the space
 * the note would occupy carries the command that fixes it, because the
 * alternative is finding out with six people waiting.
 *
 * Everything it decides comes from [`@engine/session`](../../engine/session.ts)
 * (what a cue *is*) and [`@engine/session-bench`](../../engine/session-bench.ts)
 * (what it reads as). This file only lays it out.
 */
import { cueEmptyMessage, hotkeyLabel, loopLabel, noteLabel } from "@engine/session-bench";
import type { ResolvedCue } from "@engine/session";
import { formatClock } from "@utils/clock";
import { IconButton } from "./IconButton";

export interface CueTableProps {
  cues: readonly ResolvedCue[];
  /** True when there is a plan open — an empty list means different things either way. */
  hasPlan: boolean;
  /** Index of the cue currently sounding, if it was fired from this tab. */
  playing: number | null;
  onPlay(cue: ResolvedCue): void;
  onMove(index: number, delta: number): void;
  onRemove(index: number): void;
  onEditNote(index: number): void;
  onToggleLoop(cue: ResolvedCue): void;
}

export function CueTable({ cues, hasPlan, playing, ...on }: CueTableProps) {
  return (
    <div className="tableWrap">
      <table>
        <colgroup>
          <col className="col-key" />
          <col className="col-play" />
          <col className="col-name" />
          <col className="col-len" />
          <col className="col-loop" />
          <col className="col-move" />
          <col className="col-delete" />
        </colgroup>
        <tbody id="cueRows">
          {cues.map((cue) => (
            <CueRow
              // Cues repeat — a theme may recur in one night — so the index is
              // the only stable identity a row has.
              key={cue.index}
              cue={cue}
              last={cue.index === cues.length - 1}
              playing={playing === cue.index}
              {...on}
            />
          ))}
        </tbody>
      </table>
      <div id="cueEmpty" className="empty" hidden={cues.length > 0}>
        {cueEmptyMessage(hasPlan)}
      </div>
    </div>
  );
}

interface CueRowProps {
  cue: ResolvedCue;
  last: boolean;
  playing: boolean;
  onPlay(cue: ResolvedCue): void;
  onMove(index: number, delta: number): void;
  onRemove(index: number): void;
  onEditNote(index: number): void;
  onToggleLoop(cue: ResolvedCue): void;
}

function CueRow({ cue, last, playing, ...on }: CueRowProps) {
  const playable = cue.status === "ready";
  const note = noteLabel(cue);
  const loop = loopLabel(cue.loop);

  return (
    <tr
      className={playable ? undefined : "bad"}
      aria-selected={playing}
      title={playable ? cue.entry?.path ?? "" : cue.hint}
    >
      <td className="cell-key">
        <span className="key">{hotkeyLabel(cue.index)}</span>
      </td>
      <td className="cell-play">
        <IconButton
          glyph={playable ? "▶" : "⚠"}
          label={playable ? `Play ${cue.label}` : cue.hint}
          disabled={!playable}
          onClick={() => on.onPlay(cue)}
        />
      </td>
      <td className="cell-name">
        {cue.label}
        {/* The note is why this cue is in the list at all, so it is the click
            target for editing it — a cue with no note yet offers the same spot. */}
        <span
          className={note.empty ? "note empty" : "note"}
          title="Click to edit this cue's note"
          onClick={(event) => {
            event.stopPropagation();
            on.onEditNote(cue.index);
          }}
        >
          {note.text}
        </span>
      </td>
      <td className="cell-len">{cue.audio ? formatClock(cue.audio.seconds) : "—"}</td>
      <td className="cell-loop">
        <IconButton
          glyph={loop.glyph}
          label={loop.title}
          toggle
          on={cue.loop}
          // Only a piece written with a loop window has a seam-wrapped body to repeat.
          disabled={!cue.entry?.composition.loop}
          onClick={() => on.onToggleLoop(cue)}
        />
      </td>
      <td className="cell-move">
        <IconButton
          glyph="↑"
          label="Move earlier"
          disabled={cue.index === 0}
          onClick={() => on.onMove(cue.index, -1)}
        />
        <IconButton
          glyph="↓"
          label="Move later"
          disabled={last}
          onClick={() => on.onMove(cue.index, 1)}
        />
      </td>
      <td className="cell-delete">
        <IconButton
          glyph="✕"
          label={`Remove ${cue.label} from the session`}
          danger
          onClick={() => on.onRemove(cue.index)}
        />
      </td>
    </tr>
  );
}
