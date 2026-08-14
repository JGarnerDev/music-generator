/**
 * Playback: play a rendered file. That is the whole job.
 *
 * The app synthesises nothing. Audio is produced ahead of time by
 * `npm run render` (or `npm run voice:render`) and stored in `public/audio/`;
 * this loads a URL and plays it, so playback cannot stutter, cannot fall behind,
 * and costs the same whether the piece is a two-track sketch or a twelve-track
 * wall.
 *
 * Getting here took four designs, and the three that failed are worth knowing
 * before changing this — [`docs/rendering.md`](../../docs/rendering.md) records
 * what each one broke on. The short version: anything that synthesises while
 * the user listens is racing a deadline it will eventually lose.
 */
import * as Tone from "tone";

let player: Tone.Player | null = null;
/**
 * Bumped by every play and stop. Loading a file outlives the click that started
 * it, so each play captures the token and checks it still owns the speakers
 * before starting — otherwise a superseded load would play over its replacement.
 */
let generation = 0;

/**
 * Where in the file we are, in seconds, and when that was true.
 *
 * `Tone.Player` has no pause — it can start at an offset, and that is all — so
 * pausing is: note how far in we got, stop, and start again there. Everything
 * needed for that is these two numbers plus the transport clock.
 */
let offset = 0;
let startedAt = 0;
let paused = false;
/** Set while pausing, so the player's own `onstop` doesn't report a natural end. */
let pausing = false;

export type PlaybackState = "stopped" | "playing" | "paused";

export interface PlayFileOptions {
  /** Repeat forever. The rendered `.loop` file is seam-wrapped for exactly this. */
  loop?: boolean;
  /** Called when playback of a non-looping file reaches the end. */
  onEnded?: () => void;
}

/**
 * Load and play a rendered file. Resolves once it is actually playing, so the
 * caller can report a decode failure rather than a silent nothing.
 */
export async function playFile(url: string, opts: PlayFileOptions = {}): Promise<void> {
  stopPlayback();
  const token = generation;
  const loop = opts.loop ?? false;
  await Tone.start(); // unlock the audio context from the click that got us here

  // `load()` is the promise; `player.loaded` is a *boolean* getter — awaiting
  // that resolves immediately and `start()` then throws on an empty buffer.
  const loaded = new Tone.Player({ loop });
  await loaded.load(url);
  if (token !== generation) {
    loaded.dispose(); // stopped or superseded while the file was loading
    return;
  }

  player = loaded.toDestination();
  if (!loop && opts.onEnded) {
    const ended = opts.onEnded;
    // `onstop` fires on an explicit stop too, so only report a natural end.
    player.onstop = () => {
      if (token === generation && !pausing) ended();
    };
  }
  offset = 0;
  paused = false;
  startedAt = Tone.now();
  player.start();
}

/**
 * Pause where we are. Returns false when there was nothing playing.
 *
 * Auditioning a sound means hearing one phrase again and again, and restarting
 * from the top each time is the difference between comparing two voices and
 * merely listening to them.
 */
export function pausePlayback(): boolean {
  if (!player || paused) return false;
  const duration = player.buffer.duration;
  offset = duration > 0 ? (offset + (Tone.now() - startedAt)) % duration : 0;
  pausing = true;
  player.stop();
  pausing = false;
  paused = true;
  return true;
}

/** Start again from where `pausePlayback` left off. False when not paused. */
export function resumePlayback(): boolean {
  if (!player || !paused) return false;
  paused = false;
  startedAt = Tone.now();
  player.start(undefined, offset);
  return true;
}

export function playbackState(): PlaybackState {
  if (!player) return "stopped";
  return paused ? "paused" : "playing";
}

export function stopPlayback(): void {
  generation++;
  offset = 0;
  paused = false;
  if (!player) return;
  player.stop();
  player.dispose();
  player = null;
}
