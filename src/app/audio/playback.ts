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
import { dbToFraction, fractionToDb } from "@utils/volume";
import { wrapLoopPosition } from "@utils/loop-position";

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
/** Where the repeating part of the loaded buffer starts — 0 unless an intro plays first. */
let loopStart = 0;

export type PlaybackState = "stopped" | "playing" | "paused";

export interface PlayFileOptions {
  /** Repeat forever. The rendered `.loop` file is seam-wrapped for exactly this. */
  loop?: boolean;
  /** Called when playback of a non-looping file reaches the end. */
  onEnded?: () => void;
  /**
   * With `loop`: play this file once first, up to `seconds`, then the looping
   * file forever. For a piece whose loop body starts after an intro, `url` is
   * the `.loop` file and this is the full render cut where the body *ends* — the
   * `.loop` file opens with that ending's tail wrapped in, so the join is the
   * same seam every later lap crosses.
   */
  intro?: { url: string; seconds: number };
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
  let introSeconds = 0;
  if (loop && opts.intro) {
    const [intro, body] = await Promise.all([
      new Tone.ToneAudioBuffer().load(opts.intro.url),
      new Tone.ToneAudioBuffer().load(url),
    ]);
    const joined = joinIntro(intro, opts.intro.seconds, body);
    loaded.buffer = new Tone.ToneAudioBuffer(joined.buffer);
    introSeconds = joined.loopStart;
    loaded.loopStart = introSeconds;
    loaded.loopEnd = joined.buffer.duration;
  } else {
    await loaded.load(url);
  }
  if (token !== generation) {
    loaded.dispose(); // stopped or superseded while the file was loading
    return;
  }
  loopStart = introSeconds;

  player = loaded.toDestination();
  if (!loop && opts.onEnded) {
    const ended = opts.onEnded;
    /*
     * `onstop` fires on an explicit stop too — and *asynchronously*, which the
     * `pausing` flag alone cannot cover: a pause or a seek has already put the
     * flag back and restarted the player by the time this callback lands, and
     * reporting "finished" then would blank the transport mid-cue. So the test
     * is also whether anything is sounding now: a stop with a live source after
     * it was ours, not the end of the piece.
     */
    player.onstop = () => {
      if (token !== generation || pausing || paused) return;
      if (player?.state === "started") return;
      ended();
    };
  }
  offset = 0;
  paused = false;
  startedAt = Tone.now();
  // Offset stated, never defaulted: a looping Player with no offset starts at
  // `loopStart`, which skips an intro without a word.
  player.start(undefined, 0);
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
  offset = wrapLoopPosition(offset + (Tone.now() - startedAt), duration, loopStart);
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
  if (paused) return "paused";
  // A one-shot that reaches its end leaves the player loaded but silent: nothing
  // calls back into here to clear it, so "is a source running" is the only
  // honest answer to whether we are playing.
  return player.state === "started" ? "playing" : "stopped";
}

/**
 * How long the loaded file is, in seconds — 0 when nothing is loaded.
 *
 * Only known once the buffer has decoded, which is why a scrub bar has to render
 * disabled before the first play rather than not render at all: the length of a
 * piece is not knowable from the composition JSON the page already has.
 */
export function durationSeconds(): number {
  return player?.buffer.duration ?? 0;
}

/** Where we are in the file, in seconds. Wraps with the loop, like the sound does. */
export function positionSeconds(): number {
  if (!player) return 0;
  const duration = player.buffer.duration;
  if (duration <= 0) return 0;
  const elapsed = paused ? offset : offset + (Tone.now() - startedAt);
  return wrapLoopPosition(elapsed, duration, loopStart);
}

/**
 * Jump to a point in the file and keep the previous play/pause state.
 *
 * `Tone.Player` cannot seek — it can only start at an offset — so this is a stop
 * and a restart, the same trick `pausePlayback` uses. The generation token is
 * deliberately *not* bumped: this is the same play continuing somewhere else, and
 * bumping it would make the in-flight `onstop` report a natural end.
 *
 * Returns false when there is nothing loaded to seek.
 */
export function seekTo(seconds: number): boolean {
  if (!player) return false;
  const duration = player.buffer.duration;
  if (duration <= 0) return false;
  const target = Math.min(Math.max(seconds, 0), Math.max(duration - 0.01, 0));

  const wasPlaying = !paused;
  pausing = true; // the stop below is a seek, not the end of the piece
  player.stop();
  pausing = false;
  offset = target;
  if (wasPlaying) {
    startedAt = Tone.now();
    player.start(undefined, offset);
  }
  return true;
}

/**
 * Set the output level from a 0–1 fader position.
 *
 * Applied to the destination rather than to the player, so it survives every
 * stop, seek and cue change — at a table you set the room's level once and it
 * stays where you put it. Safe before any audio has been started: reading the
 * destination does not resume a suspended context.
 */
export function setVolume(fraction: number): void {
  Tone.getDestination().volume.value = fractionToDb(fraction);
}

/** The current fader position, 0–1. */
export function getVolume(): number {
  return dbToFraction(Tone.getDestination().volume.value);
}

export function stopPlayback(): void {
  generation++;
  offset = 0;
  loopStart = 0;
  paused = false;
  if (!player) return;
  player.stop();
  player.dispose();
  player = null;
}

/**
 * How long the hand-off from intro to loop takes. The two files are separate
 * renders — their reverbs and drifts never match sample for sample — so a
 * straight cut clicks. The crossfade runs into the *end* of the loop file just
 * before the join, so the join itself is the loop's own seam, which is clean,
 * and the body's first downbeat is never faded.
 */
const INTRO_HANDOFF_SECONDS = 0.05;

/**
 * The first `seconds` of `intro` followed by all of `body`, as one buffer, and
 * where the body starts in it. One buffer rather than two players handed off on
 * a timer, so pause, seek and the scrub bar keep working on a single position.
 */
function joinIntro(
  intro: Tone.ToneAudioBuffer,
  seconds: number,
  body: Tone.ToneAudioBuffer,
): { buffer: AudioBuffer; loopStart: number } {
  const a = intro.get()!;
  const b = body.get()!;
  const head = Math.min(a.length, Math.round(seconds * a.sampleRate));
  const fade = Math.min(Math.round(INTRO_HANDOFF_SECONDS * b.sampleRate), head, b.length);
  const channels = Math.max(a.numberOfChannels, b.numberOfChannels);
  const out = Tone.getContext().createBuffer(channels, head + b.length, b.sampleRate);
  for (let c = 0; c < channels; c++) {
    const data = out.getChannelData(c);
    const from = a.getChannelData(Math.min(c, a.numberOfChannels - 1));
    const to = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
    data.set(from.subarray(0, head - fade), 0);
    for (let i = 0; i < fade; i++) {
      // Equal power: the two renders are uncorrelated at this scale.
      const g = (i + 0.5) / fade;
      data[head - fade + i] =
        from[head - fade + i]! * Math.cos((g * Math.PI) / 2) +
        to[b.length - fade + i]! * Math.sin((g * Math.PI) / 2);
    }
    data.set(to, head);
  }
  return { buffer: out, loopStart: head / b.sampleRate };
}
