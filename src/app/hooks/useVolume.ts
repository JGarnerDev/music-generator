/**
 * The session board's fader.
 *
 * The level is a property of the *room*, not of the running order: the same
 * session played on a laptop and through a speaker wants different levels, so it
 * is remembered per browser rather than written into `sessions/<name>.json`.
 *
 * Restored at import rather than from an effect. A gain value is not a
 * transport — nothing starts, nothing is generation-tokened, and setting it
 * twice sets it to the same number — but the restore still has to happen exactly
 * once and *before* the first paint, or the board would flash 80% on a browser
 * that has it at 30. Module scope gives both for free, whatever StrictMode does
 * to the component.
 */
import { useState } from "react";
import { parseStoredVolume, volumeRead } from "@engine/session-bench";
import { setVolume } from "../audio/playback";

const VOLUME_KEY = "music-generator.volume";
const DEFAULT_VOLUME = 0.8;
/** One arrow-key press. 5% of the travel: audible, but not a jump at a table. */
export const VOLUME_STEP = 0.05;

function read(): number {
  try {
    return parseStoredVolume(window.localStorage.getItem(VOLUME_KEY)) ?? DEFAULT_VOLUME;
  } catch {
    // Private browsing or a locked-down profile: start at the default.
    return DEFAULT_VOLUME;
  }
}

function write(level: number): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, String(level));
  } catch {
    // The level still works, it just does not survive a reload. Not worth a
    // message during a game.
  }
}

const RESTORED = read();
setVolume(RESTORED);

/** Where the fader ended up after a move — what the status line reports. */
export interface FaderState {
  level: number;
  muted: boolean;
}

export interface Fader extends FaderState {
  /** The number beside the slider: `80%`, or `muted`. */
  read: string;
  /** Slider position, 0–100. */
  percent: number;
  /** Move to `next` (0–1), clamped. Any move off the bottom also unmutes. */
  set(next: number): FaderState;
  /** Move by `delta` — the arrow keys. */
  nudge(delta: number): FaderState;
  toggleMute(): FaderState;
}

export function useVolume(): Fader {
  const [level, setLevel] = useState(RESTORED);
  const [muted, setMuted] = useState(false);

  /**
   * Push a level/mute pair at the audio graph and into state, and hand it back:
   * a caller announcing what it just did must not read the *previous* render's
   * numbers off the hook.
   */
  function apply(next: number, nextMuted: boolean): FaderState {
    setVolume(nextMuted ? 0 : next);
    setLevel(next);
    setMuted(nextMuted);
    return { level: next, muted: nextMuted };
  }

  function move(next: number): FaderState {
    const clamped = Math.min(Math.max(next, 0), 1);
    // Dragging the fader up out of silence means "let me hear it" — staying
    // muted at 60% is the kind of thing you debug for a minute mid-scene.
    write(clamped);
    return apply(clamped, clamped > 0 ? false : muted);
  }

  return {
    level,
    muted,
    read: volumeRead(level, muted),
    percent: Math.round(level * 100),
    set: move,
    nudge: (delta: number) => move(level + delta),
    toggleMute: () => apply(level, !muted),
  };
}
