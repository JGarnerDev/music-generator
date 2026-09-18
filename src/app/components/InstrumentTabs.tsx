/**
 * The instrument tabs over the voice table: All · pad · lead · pluck · …, each
 * with how many voices it holds.
 *
 * Counts come from [`@engine/voice-library`](../../engine/voice-library.ts), and
 * the labels are the instrument names themselves — a track's `instrument` field
 * says `pluck`, so the shelf says `pluck` too. The strip itself is
 * [`Tabs`](./Tabs.tsx), shared with the other two benches.
 */
import { VOICE_INSTRUMENTS, countsByInstrument, type VoiceEntry } from "@engine/voice-library";
import type { InstrumentName } from "@engine/composition";
import { Tabs } from "./Tabs";

export interface InstrumentTabsProps {
  entries: readonly VoiceEntry[];
  /** null = the "All" tab. */
  instrument: InstrumentName | null;
  /**
   * Which shelves to show. Defaults to every instrument — the voice bench wants
   * all of them even when one is empty, because an empty shelf there is a
   * to-do. The keys bench passes a shorter list: it cannot play drums at all,
   * and a tab that can only ever be empty is a dead end with a count on it.
   */
  names?: readonly InstrumentName[];
  onPick(instrument: InstrumentName | null): void;
}

export function InstrumentTabs({ entries, instrument, names = VOICE_INSTRUMENTS, onPick }: InstrumentTabsProps) {
  const counts = countsByInstrument(entries);
  return (
    <Tabs
      label="Instruments"
      selected={instrument}
      onPick={onPick}
      items={[
        { value: null, label: "All", count: entries.length },
        ...names.map((name) => ({ value: name, label: name, count: counts[name] })),
      ]}
    />
  );
}
