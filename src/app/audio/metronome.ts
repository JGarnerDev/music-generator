/**
 * The click: a practice aid first, and the take's grid second.
 *
 * It runs on its own. Turn it on and it clicks until you turn it off —
 * recording does not start it, stopping does not stop it — because the thing a
 * player actually needs is a pulse to find a phrase against, which happens long
 * before anybody presses Record and continues after.
 *
 * That independence is also what removed the count-in setting. A click that is
 * already running *is* the count-in: arming the recorder just waits for the next
 * downbeat, so you are always counted in by the bars you were already playing
 * over, and there is no separate number to choose.
 *
 * It is never recorded. The take is a list of key presses, and the click is not
 * one — nothing of it can reach the file even in principle.
 */
import * as Tone from "tone";

/** Beats in a bar. Fixed: the bench records in 4/4 and re-reads elsewhere. */
export const BEATS_PER_BAR = 4;

export interface ClickCallbacks {
  /**
   * Every beat: which beat of the bar it is, and when it lands on the
   * `performance.now` clock the key events are stamped with.
   *
   * That second argument is the whole reason the click owns the grid. A
   * recording armed mid-bar starts at the *next* downbeat, and this is the only
   * place that moment is known in the same units a keystroke is.
   */
  onBeat?(beatInBar: number, atMs: number): void;
}

/**
 * A wooden click: a short pitched blip, higher on the downbeat.
 *
 * Deliberately not a kit piece from `voices/drums/*`. Those are *music*, mixed
 * to sit in an arrangement; a click has to cut through whatever is being played
 * over it and then be forgotten, and it never ends up in a file.
 */
const DOWNBEAT = "C6";
const OFFBEAT = "C5";

export class Click {
  private synth: Tone.MembraneSynth | null = null;
  private loop: Tone.Loop | null = null;
  private beat = 0;
  private callbacks: ClickCallbacks = {};

  get running(): boolean {
    return this.loop !== null;
  }

  /** Where the callbacks live. Replaceable while running — the page re-renders. */
  listen(callbacks: ClickCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Start clicking. Starting an already-running click only changes its tempo,
   * so a page that calls this on every render does not stutter the pulse.
   */
  start(bpm: number): void {
    if (this.running) {
      this.setBpm(bpm);
      return;
    }
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.bpm.value = bpm;
    transport.position = 0;

    this.synth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
      volume: -6,
    }).toDestination();
    this.beat = 0;

    this.loop = new Tone.Loop((time) => {
      const beatInBar = this.beat % BEATS_PER_BAR;
      this.beat += 1;
      this.synth?.triggerAttackRelease(beatInBar === 0 ? DOWNBEAT : OFFBEAT, 0.03, time);
      // The audio clock and the keystroke clock are different origins ticking at
      // the same rate, so one reading of the offset converts between them. Taken
      // per beat rather than once at the start: a tab that was throttled or a
      // context that drifted would otherwise put the grid somewhere the player
      // never heard a click.
      const atMs = performance.now() + (time - Tone.now()) * 1000;
      this.callbacks.onBeat?.(beatInBar, atMs);
    }, "4n").start(0);

    transport.start();
  }

  /** Change tempo without breaking the pulse. Ignored when the click is off. */
  setBpm(bpm: number): void {
    if (this.running) Tone.getTransport().bpm.value = bpm;
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    this.loop?.dispose();
    this.loop = null;
    // Let the last click ring out rather than cutting it off with the node.
    const synth = this.synth;
    this.synth = null;
    setTimeout(() => synth?.dispose(), 200);
  }
}
