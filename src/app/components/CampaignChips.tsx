/**
 * The archive's campaign shelf: All, then one chip per campaign in the library.
 *
 * A shelf rather than a tab strip on purpose — it sits *inside* the archive
 * panel beside the search box, and the tabs above it already own the top of the
 * page. Two strips of equal-width tabs would read as one broken one.
 */
import type { LibraryEntry } from "@engine/library";
import { campaignsOf } from "@engine/session";
import { Chip } from "jeff-ui";

export interface CampaignChipsProps {
  entries: readonly LibraryEntry[];
  /** null = the All chip. */
  campaign: string | null;
  onPick(campaign: string | null): void;
}

export function CampaignChips({ entries, campaign, onPick }: CampaignChipsProps) {
  return (
    <div id="campaigns">
      <Chip pressed={campaign === null} onToggle={() => onPick(null)}>
        All
      </Chip>
      {campaignsOf(entries).map((slug) => (
        <Chip key={slug} pressed={campaign === slug} onToggle={() => onPick(slug)}>
          {slug}
        </Chip>
      ))}
    </div>
  );
}
