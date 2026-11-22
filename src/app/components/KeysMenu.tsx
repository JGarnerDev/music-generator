/**
 * The hamburger: the settings that are not controls.
 *
 * Everything on the top row of the keys page is something a hand reaches for
 * *while playing* — the voice, the octave. The monitor is the other kind of
 * thing: you set it once when you pick up the phone, and then you want the
 * screen back, because on a phone the instrument is the screen. So it lives
 * behind a button rather than beside the keys, which is the opposite of the
 * rule the rest of this page follows and is the reason this file exists.
 *
 * jeff-ui's `Popover` closes it the three ways a menu on a phone is dismissed:
 * the button again, a tap outside it, and escape. Escape also panics the
 * instrument, which is deliberate — the key that means "stop everything" should
 * not mean something narrower just because a panel happens to be open. Picking
 * a monitor closes it too, because the choice is the whole reason it was open.
 */
import { MONITOR_PROFILES, type MonitorId } from "@engine/monitor";
import { Column, Popover, RadioGroup, Text } from "jeff-ui";

export interface KeysMenuProps {
  monitor: MonitorId;
  onMonitor(id: MonitorId): void;
}

const OPTIONS = MONITOR_PROFILES.map((profile) => ({
  value: profile.id,
  label: (
    <Column gap={1}>
      <Text strong>{profile.label}</Text>
      <Text size="xs" tone="muted">
        {profile.summary}
      </Text>
    </Column>
  ),
}));

export function KeysMenu({ monitor, onMonitor }: KeysMenuProps) {
  return (
    <div id="menu">
      <Popover label="Settings" icon={<span aria-hidden="true">☰</span>}>
        {({ close }) => (
          <RadioGroup
            label="Monitor"
            options={OPTIONS}
            value={monitor}
            onChange={(id) => {
              onMonitor(id);
              close();
            }}
          />
        )}
      </Popover>
    </div>
  );
}
