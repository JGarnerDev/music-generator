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
import { Button, Row, Text } from "jeff-ui";

export interface SetStripProps {
  entries: readonly StudyEntry[];
  /** The attempt under the needle, or null when nothing is selected. */
  entry: StudyEntry | null;
  onSelect(entry: StudyEntry): void;
}

/** A sibling's thumb as a button hue: kept in the ok color, dropped in the error one. */
const THUMB_HUES = { up: "var(--ui-ok)", down: "var(--ui-err)" } as const;

export function SetStrip({ entries, entry, onSelect }: SetStripProps) {
  if (!entry) return <Row id="set" aria-label="The rest of this set" />;

  return (
    <Row id="set" aria-label="The rest of this set" gap={1} wrap={false} align="center">
      <Text as="span" size="xs" tone="muted">{`set ${entry.study.set ?? "—"}:`}</Text>
      {siblingsOf(entries, entry).map((sibling) => {
        const thumb = sibling.study.verdict?.thumb;
        const current = sibling.id === entry.id;
        return (
          <Button
            key={sibling.id}
            variant={current ? "primary" : "default"}
            hue={!current && thumb ? THUMB_HUES[thumb] : undefined}
            aria-current={current}
            title={sibling.study.approach ?? sibling.id}
            onClick={() => onSelect(sibling)}
          >
            {siblingLabel(sibling)}
          </Button>
        );
      })}
    </Row>
  );
}
