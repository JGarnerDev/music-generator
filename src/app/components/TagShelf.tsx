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
import { Box, Chip, Column, Field, Row } from "jeff-ui";

export interface TagShelfProps {
  /** The tags armed for the current selection. */
  picked: ReadonlySet<string>;
  disabled: boolean;
  onToggle(tag: string): void;
}

export function TagShelf({ picked, disabled, onToggle }: TagShelfProps) {
  return (
    <Box id="tags" inset aria-label="Verdict tags">
      <Column gap={2}>
        {TAG_FACETS.map((facet) => (
          <Field key={facet} label={facet} layout="inline" group>
            <Row gap={1}>
              {tagsOfFacet(facet).map((tag) => (
                <Chip
                  key={tag.name}
                  title={tag.blurb}
                  disabled={disabled}
                  pressed={picked.has(tag.name)}
                  onToggle={() => onToggle(tag.name)}
                >
                  {tag.name}
                </Chip>
              ))}
            </Row>
          </Field>
        ))}
      </Column>
    </Box>
  );
}
