/**
 * The library table: play · name · tags · delete, one row per piece.
 *
 * Dumb by design — every decision about *which* entries exist, what they're
 * tagged with and which leitmotifs they quote comes from the pure
 * [`@engine/library`](../../engine/library.ts). This file decides only what a row
 * looks like.
 *
 * Column widths come from the `<colgroup>` and `table-layout: fixed`, not from
 * the content: the bench is a tool you use with your eyes in one place, so a
 * longer name clips rather than moving the Play button.
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
import { Chip } from "./Chip";
import { IconButton } from "./IconButton";

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

  return (
    <div id="libraryWrap">
      <table id="library">
        <colgroup>
          <col className="col-play" />
          <col className="col-name" />
          <col className="col-tags" />
          <col className="col-delete" />
        </colgroup>
        <tbody id="rows">
          {visible.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              showKind={kind === null}
              selected={entry.id === selectedId}
              quotedBy={usage.get(entry.slug)?.length ?? 0}
              onSelect={props.onSelect}
              onPlay={props.onPlay}
              onDelete={props.onDelete}
              canDelete={props.canDelete}
            />
          ))}
        </tbody>
      </table>
      <div id="empty" hidden={visible.length > 0}>
        {emptyMessage(kind, query)}
      </div>
    </div>
  );
}

interface RowProps {
  entry: LibraryEntry;
  /** The kind column only says anything on the All tab. */
  showKind: boolean;
  selected: boolean;
  quotedBy: number;
  onSelect(entry: LibraryEntry): void;
  onPlay(entry: LibraryEntry): void;
  onDelete(entry: LibraryEntry): void;
  canDelete: boolean;
}

function Row({ entry, showKind, selected, quotedBy, canDelete, ...on }: RowProps) {
  const chips = chipLabels(entry, quotedBy);
  return (
    <tr aria-selected={selected} title={entry.path} onClick={() => on.onSelect(entry)}>
      <td className="cell-play">
        <IconButton glyph="▶" label={`Play ${entry.slug}`} onClick={() => on.onPlay(entry)} />
      </td>
      <td className="cell-name">
        {entry.slug}
        <span className="kind">{showKind ? entry.kind : ""}</span>
      </td>
      {/* Cells are clamped to one line, so anything clipped is still readable on hover. */}
      <td className="cell-tags" title={chips.map((chip) => chip.text).join(" · ")}>
        {chips.map((chip) => (
          <Chip key={chip.text} label={chip} />
        ))}
      </td>
      <td className="cell-delete">
        {canDelete ? (
          <IconButton
            glyph="🗑"
            label={`Delete ${entry.slug}`}
            danger
            onClick={() => on.onDelete(entry)}
          />
        ) : (
          <span />
        )}
      </td>
    </tr>
  );
}
