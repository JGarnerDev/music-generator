/**
 * The study table: play · set/attempt · variant · verdict, one row per attempt.
 *
 * Dumb by design, like the other two tables: which rows exist, what each is
 * called and which chip it wears come from
 * [`@engine/study-bench`](../../engine/study-bench.ts).
 *
 * The variant column carries the approach line as its `title`, so the one thing
 * a row cannot show — what this attempt actually does differently — is a hover
 * away while you are scanning rather than a selection away.
 */
import {
  emptyStudiesMessage,
  rowLabel,
  verdictChip,
  visibleStudies,
  type StudyFilters,
} from "@engine/study-bench";
import type { StudyEntry } from "@engine/study-library";
import { Badge, type BadgeTone, IconButton, Table, Text, type TableColumn } from "jeff-ui";

export interface StudyTableProps {
  entries: readonly StudyEntry[];
  filters: StudyFilters;
  onSelect(entry: StudyEntry): void;
  onPlay(entry: StudyEntry): void;
}

export function StudyTable({ entries, filters, ...on }: StudyTableProps) {
  const visible = visibleStudies(entries, filters);
  const columns: TableColumn<StudyEntry>[] = [
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
      key: "name",
      width: "34%",
      cell: (entry) => (
        <>
          <Text as="span" strong>
            {rowLabel(entry)}
          </Text>{" "}
          <Text as="span" size="xs" tone="muted">
            {entry.concept}
          </Text>
        </>
      ),
    },
    {
      key: "variant",
      title: (entry) => entry.study.approach ?? "",
      cell: (entry) => (
        <>
          <Text as="span" size="sm" tone="muted">{`${entry.study.axis ?? "?"} ·`}</Text>{" "}
          {entry.study.variant ?? ""}
        </>
      ),
    },
    {
      key: "verdict",
      width: "5.5rem",
      cell: (entry) => {
        const chip = verdictChip(entry);
        return <Badge tone={verdictTone(chip.variant)}>{chip.text}</Badge>;
      },
    },
  ];

  return (
    <Table
      id="studies"
      frame
      columns={columns}
      rows={visible}
      rowKey={(entry) => entry.id}
      onRowClick={on.onSelect}
      selected={(entry) => entry.id === filters.selectedId}
      rowProps={(entry) => ({ title: entry.path.replace(/^.*studies\//, "studies/") })}
      empty={emptyStudiesMessage(filters.query, filters.unjudgedOnly, entries.length)}
    />
  );
}

/** A verdict chip's variant (`up`, `down`, `draft`, `broken`) as a Badge tone. */
function verdictTone(variant: string | undefined): BadgeTone {
  if (variant === "up") return "ok";
  if (variant === "down" || variant === "broken") return "err";
  if (variant === "draft") return "warn";
  return "muted";
}
