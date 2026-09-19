/**
 * What the live page is being *heard on*, as opposed to what it sounds like.
 *
 * Everything else in this project treats the audio as fixed and the speakers as
 * somebody else's problem, which is right: a rendered piece is a file, and a
 * file that was EQ'd for a phone is a file that is wrong on every other thing
 * that plays it. This module is the one exception, and it is narrow on purpose —
 * it exists only in [`live.ts`](../app/audio/live.ts), between the instrument
 * and the speakers, and **nothing it does reaches a rendered file**.
 *
 * The case it answers was measured rather than guessed. A kit's kick and toms
 * are the loudest pieces in it — around 9 dB over the snare and 20 over the hat,
 * at the peak and in the average — and on a phone they are the quietest things
 * you can hear, because ~77% of a kick's energy sits at 40–150 Hz and a phone
 * speaker radiates almost nothing down there. Worse, the driver still *tries*:
 * the excursion it spends on a fundamental nobody will hear is excursion that
 * distorts the part of the sound they would have.
 *
 * So the small-speaker profile takes the sub away and gives it back where the
 * driver works — a push at 240 Hz, which is where a phone actually radiates a
 * drum, and a click at 3 kHz, which is the beater the low end was carrying.
 * Measured on `drums/house-kit`: kick and toms up ~2 dB in the band a small
 * speaker passes, and up ~3.5 dB *against* the hats, which is the balance that
 * was wrong.
 *
 * Pure and tested because it is a spec rather than a graph: these numbers are
 * the whole design, and they are the kind of thing that gets nudged in a
 * browser at midnight and never written down.
 */

/** Which monitor the live page is playing through. */
export type MonitorId = "flat" | "small-speaker";

/** One filter in a monitor chain, in the shape `Tone.Filter` takes. */
export interface MonitorStage {
  type: "highpass" | "peaking";
  hz: number;
  /** dB, for a peaking stage. */
  gain?: number;
  q?: number;
  /** dB/octave, for the highpass. Steeper than -12 needs a cascade, which Tone does. */
  rolloff?: -12 | -24 | -48;
}

export interface MonitorProfile {
  id: MonitorId;
  /** What the menu calls it. */
  label: string;
  /** One line under the label: what it does, and what it does not. */
  summary: string;
  stages: readonly MonitorStage[];
  /**
   * Output gain after the stages.
   *
   * A boost with no trim behind it is a louder signal that clips, and the
   * limiter after it would be holding the peaks down constantly rather than
   * catching the odd one — which is a compressor nobody asked for. Trimmed here
   * the balance changes and the volume knob stays the user's.
   */
  trim: number;
}

/**
 * Flat: the wire. What every other page in this project plays through, and what
 * a rendered file is mixed against.
 */
const FLAT: MonitorProfile = {
  id: "flat",
  label: "Flat",
  summary: "No correction — what the piece will sound like when it is rendered.",
  stages: [],
  trim: 1,
};

/**
 * Small speaker: a phone, a laptop, a tablet lying on a table.
 *
 * The highpass is the half that matters and the boost is the half you notice.
 * 110 Hz at -24 dB/octave is below anything a small driver reproduces and above
 * most of what a kick wastes itself on; the 240 Hz push is the *second*
 * harmonic region, which is what a listener's ear reconstructs the missing
 * fundamental from; the 3 kHz click is the beater, the stick and the pick, and
 * it is the part of a low sound a small speaker can actually deliver.
 */
const SMALL_SPEAKER: MonitorProfile = {
  id: "small-speaker",
  label: "Small speaker",
  summary: "Lifts kick and toms on a phone or laptop. Monitoring only — renders are untouched.",
  stages: [
    { type: "highpass", hz: 110, rolloff: -24 },
    { type: "peaking", hz: 240, gain: 6, q: 0.9 },
    { type: "peaking", hz: 3000, gain: 5, q: 1 },
  ],
  trim: 0.72,
};

export const MONITOR_PROFILES: readonly MonitorProfile[] = [FLAT, SMALL_SPEAKER];

export function monitorProfile(id: MonitorId): MonitorProfile {
  return MONITOR_PROFILES.find((profile) => profile.id === id) ?? FLAT;
}

/**
 * Where the toggle starts on a device that has never been told.
 *
 * On for a coarse pointer, because a finger means a phone and a phone means a
 * speaker the size of a fingernail — the case the profile was measured for, and
 * one where starting flat means the first thing the user hears is the problem.
 * Off everywhere else: a laptop with headphones plugged in is a full-range
 * monitor, and correcting it would be colouring a mix that is already right.
 */
export function defaultMonitor(coarsePointer: boolean): MonitorId {
  return coarsePointer ? "small-speaker" : "flat";
}

/** Whether a stored string is still a monitor we have. */
export function isMonitorId(value: unknown): value is MonitorId {
  return MONITOR_PROFILES.some((profile) => profile.id === value);
}

/**
 * What the page says when the monitor changes.
 *
 * It names the *renders* both ways round, because that is the question a
 * correction like this raises the moment it is audible: the user has just
 * changed how the kit sounds and needs to know they have not changed the kit.
 */
export function monitorMessage(id: MonitorId): string {
  const profile = monitorProfile(id);
  return profile.id === "flat"
    ? "Flat — hearing the kit as it will render."
    : `${profile.label} — kick and toms lifted for this device. Renders are unchanged.`;
}
