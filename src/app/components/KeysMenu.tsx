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
 * Closing is three ways because a menu on a phone is dismissed three ways: the
 * button again, a tap outside it, and escape. Escape also panics the
 * instrument, which is deliberate — the key that means "stop everything" should
 * not mean something narrower just because a panel happens to be open.
 */
import { useEffect, useRef, useState } from "react";
import { MONITOR_PROFILES, type MonitorId } from "@engine/monitor";

export interface KeysMenuProps {
  monitor: MonitorId;
  onMonitor(id: MonitorId): void;
}

export function KeysMenu({ monitor, onMonitor }: KeysMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    // Capture, so a tap that lands on a piano key closes the menu *and* plays
    // the note — the keyboard is never not an instrument.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className={open ? "hamburger on" : "hamburger"}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((now) => !now)}
      >
        <span aria-hidden="true">☰</span>
      </button>

      {open ? (
        <div className="panel" role="menu" aria-label="Settings">
          <p className="heading">monitor</p>
          {MONITOR_PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="menuitemradio"
              aria-checked={monitor === profile.id}
              className={monitor === profile.id ? "choice picked" : "choice"}
              onClick={() => {
                onMonitor(profile.id);
                setOpen(false);
              }}
            >
              <span className="label">
                {profile.label}
                {monitor === profile.id ? " ·" : ""}
              </span>
              <span className="summary">{profile.summary}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
