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
  onPick(instrument: InstrumentName | null): void;
}

export function InstrumentTabs({ entries, instrument, onPick }: InstrumentTabsProps) {
  const counts = countsByInstrument(entries);
  return (
    <Tabs
      label="Instruments"
      selected={instrument}
      onPick={onPick}
      items={[
        { value: null, label: "All", count: entries.length },
        ...VOICE_INSTRUMENTS.map((name) => ({ value: name, label: name, count: counts[name] })),
      ]}
    />
  );
}
