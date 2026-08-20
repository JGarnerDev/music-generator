/**
 * The verdict tag shelf, grouped by facet.
 *
 * The chips are the primary input and the note underneath is the overflow: a
 * free-text reason appears once and can never be counted, whereas `cluttered`
 * said five times is a preference — and the tally in `studies/ledger.md` is what
 * `docs/taste.md` gets written from. So the shelf is
 * [a fixed list](../../engine/study.ts), never something a verdict can extend.
 */
import { TAG_FACETS, tagsOfFacet } from "@engine/study";

export interface TagShelfProps {
  /** The tags armed for the current selection. */
  picked: ReadonlySet<string>;
  disabled: boolean;
  onToggle(tag: string): void;
}

export function TagShelf({ picked, disabled, onToggle }: TagShelfProps) {
  return (
    <div id="tags" aria-label="Verdict tags">
      {TAG_FACETS.map((facet) => (
        <div className="facet" key={facet}>
          <span className="facet-name">{facet}</span>
          {tagsOfFacet(facet).map((tag) => (
            <button
              key={tag.name}
              type="button"
              className="tagchip"
              title={tag.blurb}
              disabled={disabled}
              aria-pressed={picked.has(tag.name)}
              onClick={() => onToggle(tag.name)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
