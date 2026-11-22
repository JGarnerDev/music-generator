/**
 * The campaign's shelf: play · name · tags · add. What the archive tab is for is
 * auditioning a piece and dropping it into tonight's running order, so those are
 * the only two things a row does.
 *
 * Sibling of the composition bench's [`LibraryTable`](./LibraryTable.tsx) — same
 * row grammar, different verbs. It has no delete: the board is a performance
 * tool, and the bench stays the place where pieces are judged.
 */
import { searchEntries, type LibraryEntry } from "@engine/library";
import { entriesOfCampaign } from "@engine/session";
import { archiveChips, archiveEmptyMessage } from "@engine/session-bench";
import { Badge, IconButton, Table, Text, type TableColumn } from "jeff-ui";

export interface ArchiveTableProps {
  entries: readonly LibraryEntry[];
  /** null = every campaign. */
  campaign: string | null;
  query: string;
  /** Library id currently sounding, if it was played from this tab. */
  playing: string | null;
  onPlay(entry: LibraryEntry): void;
  onAdd(entry: LibraryEntry): void;
}

export function ArchiveTable({ entries, campaign, query, playing, ...on }: ArchiveTableProps) {
  const visible = searchEntries(entriesOfCampaign(entries, campaign), query);
  const columns: TableColumn<LibraryEntry>[] = [
    {
      key: "play",
      width: "3rem",
      cell: (entry) => (
        <IconButton label={`Audition ${entry.slug}`} onClick={() => on.onPlay(entry)}>
          ▶
        </IconButton>
      ),
    },
    {
      key: "name",
      width: "46%",
      cell: (entry) => (
        <>
          <Text as="span" strong>
            {entry.slug}
          </Text>{" "}
          <Text as="span" size="xs" tone="muted">
            {entry.kind}
          </Text>
        </>
      ),
    },
    {
      key: "tags",
      // Cells are clamped to one line, so anything clipped is still readable on hover.
      title: (entry) =>
        archiveChips(entry)
          .map((chip) => chip.text)
          .join(" · "),
      cell: (entry) =>
        archiveChips(entry).map((chip) => (
          <Badge key={chip.text} tone={chip.campaign ? "accent" : "muted"}>
            {chip.text}
          </Badge>
        )),
    },
    {
      key: "add",
      width: "3rem",
      cell: (entry) => (
        <IconButton label={`Add ${entry.slug} to the session`} onClick={() => on.onAdd(entry)}>
          ＋
        </IconButton>
      ),
    },
  ];

  return (
    <Table
      frame
      columns={columns}
      rows={visible}
      rowKey={(entry) => entry.id}
      selected={(entry) => playing === entry.id}
      rowProps={(entry) => ({ title: entry.path })}
      empty={archiveEmptyMessage(campaign, query)}
    />
  );
}
