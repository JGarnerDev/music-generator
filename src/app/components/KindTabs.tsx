/**
 * The kind tabs over the library table: All · Leitmotifs · Segments · Loops ·
 * Songs, each with how many pieces it holds.
 *
 * Counts come from [`@engine/library`](../../engine/library.ts); the strip
 * itself is [`Tabs`](./Tabs.tsx), shared with the other two benches.
 */
import { COMPOSITION_KINDS, countsByKind, type CompositionKind, type LibraryEntry } from "@engine/library";
import { Tabs } from "./Tabs";

const TAB_LABELS: Record<CompositionKind, string> = {
  leitmotifs: "Leitmotifs",
  segments: "Segments",
  loops: "Loops",
  songs: "Songs",
};

export interface KindTabsProps {
  entries: readonly LibraryEntry[];
  /** null = the "All" tab. */
  kind: CompositionKind | null;
  onPick(kind: CompositionKind | null): void;
}

export function KindTabs({ entries, kind, onPick }: KindTabsProps) {
  const counts = countsByKind(entries);
  return (
    <Tabs
      label="Composition kinds"
      selected={kind}
      onPick={onPick}
      items={[
        { value: null, label: "All", count: entries.length },
        ...COMPOSITION_KINDS.map((k) => ({ value: k, label: TAB_LABELS[k], count: counts[k] })),
      ]}
    />
  );
}
