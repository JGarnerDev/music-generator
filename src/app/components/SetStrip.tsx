/**
 * The set strip: this attempt's siblings, one click each.
 *
 * The set is the unit of a study — an attempt differs from its siblings on
 * exactly one axis, so a thumb only means anything against them. They are drawn
 * from the whole library rather than the filtered rows, because "unjudged only"
 * would otherwise hide exactly the attempt you are A/B-ing against. Fixed height
 * in the CSS, so switching between them never moves the transport.
 */
import { siblingLabel, siblingsOf } from "@engine/study-bench";
import type { StudyEntry } from "@engine/study-library";

export interface SetStripProps {
  entries: readonly StudyEntry[];
  /** The attempt under the needle, or null when nothing is selected. */
  entry: StudyEntry | null;
  onSelect(entry: StudyEntry): void;
}

export function SetStrip({ entries, entry, onSelect }: SetStripProps) {
  if (!entry) return <div id="set" aria-label="The rest of this set" />;

  return (
    <div id="set" aria-label="The rest of this set">
      <span className="label">{`set ${entry.study.set ?? "—"}:`}</span>
      {siblingsOf(entries, entry).map((sibling) => {
        const thumb = sibling.study.verdict?.thumb;
        return (
          <button
            key={sibling.id}
            type="button"
            className={thumb ? `sib ${thumb}` : "sib"}
            aria-current={sibling.id === entry.id}
            title={sibling.study.approach ?? sibling.id}
            onClick={() => onSelect(sibling)}
          >
            {siblingLabel(sibling)}
          </button>
        );
      })}
    </div>
  );
}
