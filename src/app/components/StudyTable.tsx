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

export interface StudyTableProps {
  entries: readonly StudyEntry[];
  filters: StudyFilters;
  onSelect(entry: StudyEntry): void;
  onPlay(entry: StudyEntry): void;
}

export function StudyTable({ entries, filters, ...on }: StudyTableProps) {
  const visible = visibleStudies(entries, filters);

  return (
    <div id="listWrap">
      <table id="studies">
        <colgroup>
          <col className="col-play" />
          <col className="col-name" />
          <col className="col-variant" />
          <col className="col-verdict" />
        </colgroup>
        <tbody id="rows">
          {visible.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              selected={entry.id === filters.selectedId}
              onSelect={on.onSelect}
              onPlay={on.onPlay}
            />
          ))}
        </tbody>
      </table>
      <div id="empty" hidden={visible.length > 0}>
        {emptyStudiesMessage(filters.query, filters.unjudgedOnly, entries.length)}
      </div>
    </div>
  );
}

interface RowProps {
  entry: StudyEntry;
  selected: boolean;
  onSelect(entry: StudyEntry): void;
  onPlay(entry: StudyEntry): void;
}

function Row({ entry, selected, ...on }: RowProps) {
  const chip = verdictChip(entry);
  return (
    <tr
      aria-selected={selected}
      title={entry.path.replace(/^.*studies\//, "studies/")}
      onClick={() => on.onSelect(entry)}
    >
      <td className="cell-play">
        <button
          type="button"
          className="icon"
          title={`Play ${entry.id}`}
          aria-label={`Play ${entry.id}`}
          // Stops here, or the row's own select handler fires as well.
          onClick={(event) => {
            event.stopPropagation();
            on.onPlay(entry);
          }}
        >
          ▶
        </button>
      </td>
      <td className="cell-name">
        {rowLabel(entry)}
        <span className="concept">{entry.concept}</span>
      </td>
      <td className="cell-variant" title={entry.study.approach ?? ""}>
        <span className="axis">{`${entry.study.axis ?? "?"} ·`}</span>
        {entry.study.variant ?? ""}
      </td>
      <td className="cell-verdict">
        <span className={chip.variant ? `chip ${chip.variant}` : "chip"}>{chip.text}</span>
      </td>
    </tr>
  );
}
