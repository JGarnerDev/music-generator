/**
 * The concept-group tabs over the study table: All · melody · harmony · rhythm ·
 * …, each with how many attempts it holds.
 *
 * The groups are the fixed shelf in [`@engine/study`](../../engine/study.ts) — a
 * concept invented for one study is a data point that can never be counted with
 * another, so this list is deliberately not derived from what is on disk. The
 * strip itself is [`Tabs`](./Tabs.tsx), shared with the other two benches.
 */
import { countsByGroup, type StudyEntry } from "@engine/study-library";
import { CONCEPT_GROUPS, type ConceptGroup } from "@engine/study";
import { Tabs } from "./Tabs";

export interface GroupTabsProps {
  entries: readonly StudyEntry[];
  /** null = the "All" tab. */
  group: ConceptGroup | null;
  onPick(group: ConceptGroup | null): void;
}

export function GroupTabs({ entries, group, onPick }: GroupTabsProps) {
  const counts = countsByGroup(entries);
  return (
    <Tabs
      label="Concept groups"
      selected={group}
      onPick={onPick}
      items={[
        { value: null, label: "All", count: entries.length },
        ...CONCEPT_GROUPS.map((g) => ({ value: g, label: g, count: counts[g] })),
      ]}
    />
  );
}
