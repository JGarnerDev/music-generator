/**
 * The library table: play · name · tags · delete, one row per piece.
 *
 * Dumb by design — every decision about *which* entries exist, what they're
 * tagged with and which leitmotifs they quote comes from the pure
 * [`@engine/library`](../../engine/library.ts). This file decides only what a row
 * looks like.
 *
 * Column widths are fixed, not taken from the content: the bench is a tool you
 * use with your eyes in one place, so a longer name clips rather than moving
 * the Play button.
 */
import {
  chipLabels,
  emptyMessage,
  entriesOfKind,
  motifUsage,
  searchEntries,
  type CompositionKind,
  type LibraryEntry,
} from "@engine/library";
import { Badge, IconButton, Table, Text, type TableColumn } from "jeff-ui";

export interface LibraryTableProps {
  entries: readonly LibraryEntry[];
  /** null = the "All" tab. */
  kind: CompositionKind | null;
  query: string;
  selectedId: string | null;
  onSelect(entry: LibraryEntry): void;
  onPlay(entry: LibraryEntry): void;
  onDelete(entry: LibraryEntry): void;
  /** False in a production build, where there is no dev server to move files. */
  canDelete: boolean;
}

export function LibraryTable(props: LibraryTableProps) {
  const { entries, kind, query, selectedId } = props;
  const visible = searchEntries(entriesOfKind(entries, kind), query);
  const usage = motifUsage(entries);
  const chipsOf = (entry: LibraryEntry) => chipLabels(entry, usage.get(entry.slug)?.length ?? 0);

  const columns: TableColumn<LibraryEntry>[] = [
    {
      key: "play",
      width: "3rem",
      cell: (entry) => (
        <IconButton label={`Play ${entry.slug}`} onClick={() => props.onPlay(entry)}>
          ▶
        </IconButton>
      ),
    },
    {
      key: "name",
      width: "48%",
      cell: (entry) => (
        <>
          <Text as="span" strong>
            {entry.slug}
          </Text>{" "}
          {/* The kind only says anything on the All tab. */}
          {kind === null ? (
            <Text as="span" size="xs" tone="muted">
              {entry.kind}
            </Text>
          ) : null}
        </>
      ),
    },
    {
      key: "tags",
      // Cells are clamped to one line, so anything clipped is still readable on hover.
      title: (entry) =>
        chipsOf(entry)
          .map((chip) => chip.text)
          .join(" · "),
      cell: (entry) =>
        chipsOf(entry).map((chip) => (
          <Badge key={chip.text} tone={chip.motif ? "accent" : "muted"}>
            {chip.text}
          </Badge>
        )),
    },
    {
      key: "delete",
      width: "3rem",
      cell: (entry) =>
        props.canDelete ? (
          <IconButton label={`Delete ${entry.slug}`} danger onClick={() => props.onDelete(entry)}>
            🗑
          </IconButton>
        ) : null,
    },
  ];

  return (
    <Table
      id="library"
      frame
      columns={columns}
      rows={visible}
      rowKey={(entry) => entry.id}
      onRowClick={props.onSelect}
      selected={(entry) => entry.id === selectedId}
      rowProps={(entry) => ({ title: entry.path })}
      empty={emptyMessage(kind, query)}
    />
  );
}
