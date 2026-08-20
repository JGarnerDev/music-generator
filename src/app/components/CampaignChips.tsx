/**
 * The archive's campaign shelf: All, then one chip per campaign in the library.
 *
 * A shelf rather than a tab strip on purpose — it sits *inside* the archive
 * panel beside the search box, and the tabs above it already own the top of the
 * page. Two strips of equal-width tabs would read as one broken one.
 */
import type { LibraryEntry } from "@engine/library";
import { campaignsOf } from "@engine/session";

export interface CampaignChipsProps {
  entries: readonly LibraryEntry[];
  /** null = the All chip. */
  campaign: string | null;
  onPick(campaign: string | null): void;
}

export function CampaignChips({ entries, campaign, onPick }: CampaignChipsProps) {
  return (
    <div id="campaigns">
      <Chip label="All" selected={campaign === null} onClick={() => onPick(null)} />
      {campaignsOf(entries).map((slug) => (
        <Chip
          key={slug}
          label={slug}
          selected={campaign === slug}
          onClick={() => onPick(slug)}
        />
      ))}
    </div>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick(): void }) {
  return (
    <button type="button" className="chip-button" aria-pressed={selected} onClick={onClick}>
      {label}
    </button>
  );
}
