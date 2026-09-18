/**
 * The one place in this project that synthesises in realtime.
 *
 * [`docs/rendering.md`](../../../docs/rendering.md) rejected live synthesis, and
 * that rejection stands for everything it was about: a written arrangement —
 * seven tracks, two guitar amps, notes scheduled ahead — misses the buffer
 * deadline and comes out with holes in it. None of that describes a keyboard.
 * One instrument, one voice at a time, at most a hand's worth of notes, and
 * nothing is scheduled at all: a key goes down and a note starts.
 *
 * It is also the one thing here that *cannot* be a file. Every other sound in
 * this app is rendered ahead of time because it can be; a keypress cannot be
 * rendered before it happens.
 *
 * So the deadline is respected rather than assumed. The voice is built under
 * `LIVE_QUALITY`, polyphony is capped and stolen rather than left to throw, and
 * the two preset kinds that would blow the budget — sections and drum kits —
 * never get here, because [`@engine/keys-bench`](../../engine/keys-bench.ts)
 * refuses them where the user can read why.
 */
import * as Tone from "tone";
import { bendCurve } from "@engine/bend";
import type { InstrumentName } from "@engine/composition";
import { midiToPitch } from "@engine/theory";
import { createVoice, type Voice } from "./instruments";
import { LIVE_QUALITY, withQuality } from "./quality";

/**
 * Tone's scheduling lookahead, in seconds.
 *
 * The default is 0.1, which is correct for a sequencer — it buys the main
 * thread a comfortable window to get events onto the audio clock early. For a
 * keyboard it is 100 ms of latency between the key and the sound, which is
 * roughly a sixteenth note at 150 BPM and comfortably enough to make a player
 * feel they are playing badly. Zero hands the note to the context immediately
 * and lets the hardware buffer be the only delay there is.
 */
const LOOKAHEAD = 0;

/** Ceiling on notes sounding at once, matching `LIVE_QUALITY.maxPolyphony`. */
const MAX_HELD = LIVE_QUALITY.maxPolyphony;

/**
 * How long the bend takes to arrive, and how long it takes to come home.
 *
 * Asymmetric because a bent string is: the push is muscle and arrives quickly,
 * the return is the string pulling the hand back and takes longer. Equal times
 * in both directions is the single thing that makes a synth pitch wheel sound
 * like a synth pitch wheel.
 */
const BEND_MS = 110;
const RETURN_MS = 150;

/**
 * How often the bend is stepped, in milliseconds.
 *
 * A `PolySynth` has no detune *signal* to ramp — each of its voices has one, but
 * the poly wrapper only exposes `set()`, which assigns rather than schedules. So
 * the travel is stepped from a timer, which is exactly what a hardware pitch
 * wheel does: MIDI bend is a stream of discrete messages too. At 8 ms a
 * two-semitone bend arrives in about fourteen steps of ~14 cents, which is well
 * under the ~20 cents anybody hears as a step.
 */
const BEND_STEP_MS = 8;

/** What `play` has to be for a key to trigger it. Sections and kits are refused upstream. */
type Keyable = Tone.PolySynth | Tone.Sampler;

function keyable(play: unknown): play is Keyable {
  return play instanceof Tone.PolySynth || play instanceof Tone.Sampler;
}

/**
 * A voice under a pair of hands: notes start when `noteOn` is called and stop
 * when `noteOff` is.
 *
 * Held notes are tracked by MIDI number rather than left to the synth, for two
 * reasons the browser forces. Auto-repeat fires `keydown` over and over while a
 * key is held, so the same note would be attacked dozens of times a second; and
 * a `keyup` can go missing entirely — alt-tab away mid-chord and the key comes
 * up in a window that is no longer listening — which is a note that sounds
 * forever. One map answers both: an attack for a pitch already held is ignored,
 * and `panic()` has something to release.
 */
export class LiveKeyboard {
  private voice: Voice | null = null;
  private master: Tone.Gain | null = null;
  private limiter: Tone.Limiter | null = null;
  /** Sounding pitches, oldest first — insertion order is the stealing order. */
  private readonly held = new Map<number, string>();
  /** Where the pitch wheel is, in cents, and the timer walking it there. */
  private cents = 0;
  private bendTimer: number | null = null;
  private current: { instrument: InstrumentName; slug?: string } | null = null;

  /**
   * Wake the audio context. Must be called from inside a click handler: a
   * browser will not start audio without a gesture, and a context that was
   * never resumed fails silently rather than loudly.
   */
  static async start(): Promise<void> {
    await Tone.start();
    Tone.getContext().lookAhead = LOOKAHEAD;
  }

  /** Whether the context is awake and a key would actually sound. */
  static get started(): boolean {
    return Tone.getContext().state === "running";
  }

  get sounding(): number {
    return this.held.size;
  }

  get instrument(): InstrumentName | null {
    return this.current?.instrument ?? null;
  }

  /**
   * Put a different sound under the hands.
   *
   * Everything sounding is released first and the old chain is disposed:
   * swapping voices mid-chord would otherwise leave the previous instrument's
   * notes ringing with nothing left that knows how to stop them.
   *
   * Re-selecting the voice already loaded is a no-op rather than a rebuild, so
   * a re-render of the page does not cost a graph teardown.
   */
  use(instrument: InstrumentName, slug?: string): void {
    if (this.current && this.current.instrument === instrument && this.current.slug === slug) return;
    this.dispose();
    // The quality profile is read while the graph is *built*, not while it
    // plays, so the ceiling has to be in force for exactly this call.
    this.voice = withQuality(LIVE_QUALITY, () => createVoice(instrument, slug));
    if (!keyable(this.voice.play)) {
      this.dispose();
      throw new Error(`${instrument}${slug ? `/${slug}` : ""} cannot be played from the keyboard`);
    }
    this.limiter = new Tone.Limiter(-1);
    this.master = new Tone.Gain(1);
    this.voice.output.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(Tone.getDestination());
    this.current = { instrument, slug };
  }

  /** Master level, 0..1. */
  setGain(value: number): void {
    if (this.master) this.master.gain.rampTo(Math.min(1, Math.max(0, value)), 0.02);
  }

  /**
   * Start a note. Returns whether it started — a repeat of a held key does not,
   * which is what the drawn keyboard uses to avoid re-lighting a lit key.
   */
  noteOn(midi: number, velocity: number): boolean {
    const play = this.voice?.play;
    if (!keyable(play) || this.held.has(midi)) return false;
    // Steal the oldest rather than let PolySynth throw past its ceiling. A
    // stolen note is a piano's own behaviour at the end of its sustain; an
    // exception mid-phrase kills the rest of the performance.
    if (this.held.size >= MAX_HELD) {
      const oldest = this.held.keys().next().value;
      if (oldest !== undefined) this.noteOff(oldest);
    }
    const pitch = midiToPitch(midi);
    this.held.set(midi, pitch);
    play.triggerAttack(pitch, undefined, velocity);
    return true;
  }

  /** Stop a note. Silent about notes that are not sounding — a stray keyup is normal. */
  noteOff(midi: number): void {
    const pitch = this.held.get(midi);
    const play = this.voice?.play;
    if (pitch === undefined || !keyable(play)) return;
    this.held.delete(midi);
    play.triggerRelease(pitch);
  }

  /**
   * Release everything. Bound to window blur and to escape, because the note
   * that never stops is the failure mode of every software keyboard ever
   * written, and it is always a keyup that went somewhere else.
   */
  panic(): void {
    const play = this.voice?.play;
    if (keyable(play)) play.releaseAll();
    this.held.clear();
    this.endBendTravel();
    this.applyDetune(0);
  }

  /** Whether this voice can bend at all. A `Sampler` has no detune to move. */
  get bendable(): boolean {
    return this.voice?.play instanceof Tone.PolySynth;
  }

  /** Cents the pitch is currently displaced by — what the page draws. */
  get bendCents(): number {
    return this.cents;
  }

  /**
   * Push the pitch. Applies to everything sounding *and* to notes struck while
   * it is held, which is what makes it a wheel rather than a per-note effect:
   * a phrase played into a held bend is played in the bent key.
   */
  bendTo(semitones: number): void {
    this.travel(semitones * 100, BEND_MS);
  }

  /** Let it come home. */
  releaseBend(): void {
    this.travel(0, RETURN_MS);
  }

  /** Step the detune from where it is to where it is going. */
  private travel(targetCents: number, overMs: number): void {
    this.endBendTravel();
    const from = this.cents;
    const distance = targetCents - from;
    if (distance === 0) return;
    const ease = bendCurve(targetCents === 0 ? "meend" : "guitar");
    const startedAt = performance.now();

    this.bendTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / overMs);
      this.applyDetune(from + distance * ease(t));
      if (t >= 1) this.endBendTravel();
    }, BEND_STEP_MS) as unknown as number;
  }

  private endBendTravel(): void {
    if (this.bendTimer !== null) clearInterval(this.bendTimer);
    this.bendTimer = null;
  }

  private applyDetune(cents: number): void {
    this.cents = cents;
    const play = this.voice?.play;
    // Only a PolySynth carries detune. A voice that cannot bend plays straight
    // rather than throwing — the phrase is worth more than the gesture, which
    // is the same call `createVoice` makes for a section asked to bend.
    if (play instanceof Tone.PolySynth) play.set({ detune: Math.round(cents) });
  }

  /** Tear the graph down. Safe to call twice. */
  dispose(): void {
    this.panic();
    this.endBendTravel();
    this.master?.dispose();
    this.limiter?.dispose();
    const play = this.voice?.play as { dispose?: () => void } | undefined;
    play?.dispose?.();
    this.voice = null;
    this.master = null;
    this.limiter = null;
    this.current = null;
  }
}
