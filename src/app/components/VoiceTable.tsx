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
import { Badge, IconButton, Table, Text, type BadgeTone, type TableColumn } from "jeff-ui";

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
  const columns: TableColumn<VoiceEntry>[] = [
    {
      key: "play",
      width: "3rem",
      cell: (entry) => (
        <IconButton label={`Play ${entry.id}`} onClick={() => on.onPlay(entry)}>
          ▶
        </IconButton>
      ),
    },
    {
      key: "slug",
      width: "34%",
      cell: (entry) => (
        <>
          <Text as="span" strong>
            {entry.slug}
          </Text>{" "}
          {/* The instrument only needs saying when the table mixes them. */}
          {instrument === null ? (
            <Text as="span" size="xs" tone="muted">
              {entry.instrument}
            </Text>
          ) : null}
        </>
      ),
    },
    {
      key: "title",
      cell: (entry) => (
        <Text as="span" tone="muted">
          {entry.preset.title ?? ""}
        </Text>
      ),
    },
    {
      key: "status",
      width: "9rem",
      cell: (entry) => (
        <>
          <Badge tone={statusTone(statusOf(entry))}>{statusOf(entry)}</Badge>
          {entry.preset.default ? <Badge tone="accent">default</Badge> : null}
        </>
      ),
    },
  ];

  return (
    <Table
      id="voices"
      frame
      columns={columns}
      rows={visible}
      rowKey={(entry) => entry.id}
      onRowClick={on.onSelect}
      selected={(entry) => entry.id === selectedId}
      rowProps={(entry) => ({ title: entry.path.replace(/^.*voices\//, "voices/") })}
      empty={emptyVoicesMessage(instrument, draftsOnly)}
    />
  );
}

/** A voice's status as a Badge tone. */
function statusTone(status: string): BadgeTone {
  if (status === "approved") return "ok";
  if (status === "draft") return "warn";
  return "err";
}
