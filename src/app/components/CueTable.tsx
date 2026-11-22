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
import {
  HOTKEY_CUES,
  cueEmptyMessage,
  hotkeyLabel,
  loopLabel,
  noteLabel,
} from "@engine/session-bench";
import type { ResolvedCue } from "@engine/session";
import { formatClock } from "@utils/clock";
import { IconButton, Kbd, Table, Text, type TableColumn } from "jeff-ui";

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

const isPlayable = (cue: ResolvedCue): boolean => cue.status === "ready";

export function CueTable({ cues, hasPlan, playing, ...on }: CueTableProps) {
  const columns: TableColumn<ResolvedCue>[] = [
    {
      key: "key",
      width: "2.5rem",
      // Past the ninth cue there is no key to show, only a dot.
      cell: (cue) =>
        cue.index < HOTKEY_CUES ? (
          <Kbd>{hotkeyLabel(cue.index)}</Kbd>
        ) : (
          <Text as="span" tone="muted">
            {hotkeyLabel(cue.index)}
          </Text>
        ),
    },
    {
      key: "play",
      width: "3rem",
      cell: (cue) => (
        <IconButton
          label={isPlayable(cue) ? `Play ${cue.label}` : cue.hint}
          disabled={!isPlayable(cue)}
          onClick={() => on.onPlay(cue)}
        >
          {isPlayable(cue) ? "▶" : "⚠"}
        </IconButton>
      ),
    },
    {
      key: "name",
      cell: (cue) => {
        const note = noteLabel(cue);
        return (
          <>
            <Text as="span" strong>
              {cue.label}
            </Text>{" "}
            {/* The note is why this cue is in the list at all, so it is the click
                target for editing it — a cue with no note yet offers the same spot. */}
            <button
              type="button"
              className={note.empty ? "note empty" : "note"}
              title="Click to edit this cue's note"
              onClick={() => on.onEditNote(cue.index)}
            >
              {note.text}
            </button>
          </>
        );
      },
    },
    {
      key: "len",
      width: "4rem",
      cell: (cue) => (
        <Text as="span" size="sm" tone="muted" numeric>
          {cue.audio ? formatClock(cue.audio.seconds) : "—"}
        </Text>
      ),
    },
    {
      key: "loop",
      width: "3rem",
      cell: (cue) => {
        const loop = loopLabel(cue.loop);
        return (
          <IconButton
            label={loop.title}
            toggle
            on={cue.loop}
            // Only a piece written with a loop window has a seam-wrapped body to repeat.
            disabled={!cue.entry?.composition.loop}
            onClick={() => on.onToggleLoop(cue)}
          >
            {loop.glyph}
          </IconButton>
        );
      },
    },
    {
      key: "move",
      width: "5rem",
      cell: (cue) => (
        <>
          <IconButton
            label="Move earlier"
            disabled={cue.index === 0}
            onClick={() => on.onMove(cue.index, -1)}
          >
            ↑
          </IconButton>
          <IconButton
            label="Move later"
            disabled={cue.index === cues.length - 1}
            onClick={() => on.onMove(cue.index, 1)}
          >
            ↓
          </IconButton>
        </>
      ),
    },
    {
      key: "delete",
      width: "3rem",
      cell: (cue) => (
        <IconButton
          label={`Remove ${cue.label} from the session`}
          danger
          onClick={() => on.onRemove(cue.index)}
        >
          ✕
        </IconButton>
      ),
    },
  ];

  return (
    <Table
      frame
      columns={columns}
      rows={cues}
      // Cues repeat — a theme may recur in one night — so the index is the only
      // stable identity a row has.
      rowKey={(cue) => cue.index}
      selected={(cue) => playing === cue.index}
      rowProps={(cue) => ({
        className: isPlayable(cue) ? undefined : "bad",
        title: isPlayable(cue) ? (cue.entry?.path ?? "") : cue.hint,
      })}
      empty={cueEmptyMessage(hasPlan)}
    />
  );
}
