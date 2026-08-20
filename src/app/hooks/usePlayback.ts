/**
 * React's handle on [`playback.ts`](../audio/playback.ts).
 *
 * Deliberately thin, and deliberately *not* an effect. The Tone.js player is a
 * module singleton holding a generation token that decides which in-flight load
 * still owns the speakers; a `useEffect` that started or stopped it would be run
 * twice by StrictMode and once more by every Fast Refresh, and each of those
 * bumps the token. So audio starts and stops from event handlers only, and this
 * hook is a stable pair of callbacks over the module that already got it right.
 *
 * No unmount cleanup for the same reason: StrictMode's throwaway unmount would
 * silence a piece the user just started.
 *
 * `state` is the one thing React needs *back* from the module — the voice
 * bench's Pause button is a Resume button while paused. It is mirrored into
 * state after each call rather than polled, and the module stays the truth: a
 * one-shot reaching its end reports "stopped" through `onEnded`, not a timer.
 */
import { useMemo, useState } from "react";
import {
  pausePlayback,
  playFile,
  playbackState,
  resumePlayback,
  stopPlayback,
  type PlayFileOptions,
  type PlaybackState,
} from "../audio/playback";

export interface Playback {
  /** What the speakers are doing: `stopped`, `playing` or `paused`. */
  state: PlaybackState;
  /** Load and play a rendered file. Resolves once it is actually sounding. */
  play(url: string, opts?: PlayFileOptions): Promise<void>;
  /** Hold position. False when there was nothing playing to hold. */
  pause(): boolean;
  /** Carry on from where `pause` left off. False when not paused. */
  resume(): boolean;
  stop(): void;
}

export function usePlayback(): Playback {
  const [state, setState] = useState<PlaybackState>("stopped");

  const controls = useMemo(() => {
    /** Mirror whatever the module now says, and pass its answer on. */
    const sync = (result: boolean): boolean => {
      setState(playbackState());
      return result;
    };
    return {
      play: async (url: string, opts: PlayFileOptions = {}) => {
        try {
          await playFile(url, {
            ...opts,
            onEnded: () => {
              setState(playbackState());
              opts.onEnded?.();
            },
          });
        } finally {
          // In `finally` so a file that fails to decode still leaves the
          // transport reading what the module actually did, not "playing".
          setState(playbackState());
        }
      },
      pause: () => sync(pausePlayback()),
      resume: () => sync(resumePlayback()),
      stop: () => {
        stopPlayback();
        setState(playbackState());
      },
    };
  }, []);

  return { ...controls, state };
}
