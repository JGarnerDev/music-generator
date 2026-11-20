/**
 * The voice table: play · slug · title · status, one row per preset.
 *
 * Dumb by design, like [`LibraryTable`](./LibraryTable.tsx): which rows exist
 * and what each one's status *is* come from
 * [`@engine/voice-bench`](../../engine/voice-bench.ts). This file decides only
 * what a row looks like.
 *
 * Fixed column widths, because the page is an A/B tool: selecting a voice with a
 * longer title must not move the row under the pointer.
 */
import { emptyVoicesMessage, statusOf, visibleVoices } from "@engine/voice-bench";
import type { VoiceEntry } from "@engine/voice-library";
import type { InstrumentName } from "@engine/composition";
import { Badge, EmptyState, IconButton } from "jeff-ui";

export interface VoiceTableProps {
  entries: readonly VoiceEntry[];
  /** null = the "All" tab. */
  instrument: InstrumentName | null;
  draftsOnly: boolean;
  selectedId: string | null;
  onSelect(entry: VoiceEntry): void;
  onPlay(entry: VoiceEntry): void;
}

export function VoiceTable({
  entries,
  instrument,
  draftsOnly,
  selectedId,
  ...on
}: VoiceTableProps) {
  const visible = visibleVoices(entries, instrument, draftsOnly);

  return (
    <div id="listWrap">
      <table id="voices">
        <colgroup>
          <col className="col-play" />
          <col className="col-slug" />
          <col className="col-title" />
          <col className="col-status" />
        </colgroup>
        <tbody id="rows">
          {visible.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              // The instrument only needs saying when the table mixes them.
              showInstrument={instrument === null}
              selected={entry.id === selectedId}
              onSelect={on.onSelect}
              onPlay={on.onPlay}
            />
          ))}
        </tbody>
      </table>
      <EmptyState id="empty" hidden={visible.length > 0}>
        {emptyVoicesMessage(instrument, draftsOnly)}
      </EmptyState>
    </div>
  );
}

interface RowProps {
  entry: VoiceEntry;
  showInstrument: boolean;
  selected: boolean;
  onSelect(entry: VoiceEntry): void;
  onPlay(entry: VoiceEntry): void;
}

function Row({ entry, showInstrument, selected, ...on }: RowProps) {
  const status = statusOf(entry);
  return (
    <tr
      aria-selected={selected}
      title={entry.path.replace(/^.*voices\//, "voices/")}
      onClick={() => on.onSelect(entry)}
    >
      <td className="cell-play">
        <IconButton label={`Play ${entry.id}`} onClick={() => on.onPlay(entry)}>
          ▶
        </IconButton>
      </td>
      <td className="cell-slug">
        {entry.slug}
        <span className="instrument">{showInstrument ? entry.instrument : ""}</span>
      </td>
      <td className="cell-title">{entry.preset.title ?? ""}</td>
      <td className="cell-status">
        <Badge tone={status === "approved" ? "ok" : status === "draft" ? "warn" : "err"}>
          {status}
        </Badge>
        {entry.preset.default ? <Badge tone="accent">default</Badge> : null}
      </td>
    </tr>
  );
}
