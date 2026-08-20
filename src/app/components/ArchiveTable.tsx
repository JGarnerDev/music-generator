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
import { IconButton } from "./IconButton";

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
  return (
    <div className="tableWrap">
      <table>
        <colgroup>
          <col className="col-play" />
          <col className="col-name" />
          <col className="col-tags" />
          <col className="col-add" />
        </colgroup>
        <tbody id="archiveRows">
          {visible.map((entry) => (
            <ArchiveRow key={entry.id} entry={entry} playing={playing === entry.id} {...on} />
          ))}
        </tbody>
      </table>
      <div id="archiveEmpty" className="empty" hidden={visible.length > 0}>
        {archiveEmptyMessage(campaign, query)}
      </div>
    </div>
  );
}

interface ArchiveRowProps {
  entry: LibraryEntry;
  playing: boolean;
  onPlay(entry: LibraryEntry): void;
  onAdd(entry: LibraryEntry): void;
}

function ArchiveRow({ entry, playing, ...on }: ArchiveRowProps) {
  const chips = archiveChips(entry);
  return (
    <tr title={entry.path} aria-selected={playing}>
      <td className="cell-play">
        <IconButton glyph="▶" label={`Audition ${entry.slug}`} onClick={() => on.onPlay(entry)} />
      </td>
      <td className="cell-name">
        {entry.slug}
        <span className="kind">{entry.kind}</span>
      </td>
      {/* Cells are clamped to one line, so anything clipped is still readable on hover. */}
      <td className="cell-tags" title={chips.map((chip) => chip.text).join(" · ")}>
        {chips.map((chip) => (
          <span key={chip.text} className={chip.campaign ? "chip campaign" : "chip"}>
            {chip.text}
          </span>
        ))}
      </td>
      <td className="cell-add">
        <IconButton
          glyph="＋"
          label={`Add ${entry.slug} to the session`}
          onClick={() => on.onAdd(entry)}
        />
      </td>
    </tr>
  );
}
