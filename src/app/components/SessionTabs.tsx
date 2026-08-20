/**
 * The session board's two shelves: tonight's running order, and the campaign's
 * whole archive to fill it from.
 *
 * No All tab — the two are different questions, not two slices of one list — so
 * this is the one strip over [`Tabs`](./Tabs.tsx) whose value is never null.
 */
import type { SessionTab } from "@engine/session-bench";
import { Tabs } from "./Tabs";

export interface SessionTabsProps {
  tab: SessionTab;
  cues: number;
  archive: number;
  onPick(tab: SessionTab): void;
}

export function SessionTabs({ tab, cues, archive, onPick }: SessionTabsProps) {
  return (
    <Tabs<SessionTab>
      label="Session board"
      selected={tab}
      onPick={(next) => onPick(next ?? "session")}
      items={[
        { value: "session", label: "Session", count: cues },
        { value: "archive", label: "Archive", count: archive },
      ]}
    />
  );
}
