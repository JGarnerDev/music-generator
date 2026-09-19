/**
 * The computer keyboard, wired to a live voice and to a press log.
 *
 * Three jobs that have to be one hook because they share the same two
 * listeners: sound a note while a key is down, tell the page which keys are lit,
 * and remember when each one went down and came up.
 *
 * The listeners are on `window` rather than on a focused element on purpose —
 * an instrument you have to click before it plays is an instrument you lose
 * mid-phrase by clicking somewhere else. The cost is that everything typed
 * anywhere on the page arrives here, which is what `TYPING` guards: the take's
 * name field contains the letters Z and Q, and typing them must not play the
 * piano. See [`./useHotkeys`](./useHotkeys.ts), which learned this first.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DrumPiece, InstrumentName } from "@engine/composition";
import { BEND_SEMITONES, DEFAULT_OCTAVE, bendDirection, midiForCode, shiftOctave } from "@engine/keys";
import { padForCode, type DrumPad } from "@engine/pads";
import { DEFAULT_VELOCITY, stepVelocity, type BendGesture, type KeyPress } from "@engine/take";
import { LiveKeyboard } from "../audio/live";

/** Where a keystroke belongs to what you are typing in, not to the instrument. */
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

export interface KeyboardSynth {
  /**
   * Pitches currently sounding — what the drawn keyboard lights.
   *
   * Pitches rather than key codes because the keyboard is drawn per pitch: the
   * two manuals overlap by an octave, so `,` and `Q` are one drawn key, and a
   * note started with the mouse has no key code at all.
   */
  heldMidis: ReadonlySet<number>;
  octave: number;
  velocity: number;
  setOctave(octave: number): void;
  setVelocity(velocity: number): void;
  /** Load a voice under the hands. Throws for a preset the keyboard cannot play. */
  use(instrument: InstrumentName, slug?: string): void;
  /** Start a note. Also how a pointer on the drawn keyboard plays one. */
  press(midi: number): void;
  /**
   * Strike a kit piece. How a pad plays, and the whole of it: a drum has no
   * release, so there is no counterpart to this the way `release` is `press`'s.
   */
  hit(piece: DrumPiece): void;
  /**
   * Pieces struck a moment ago — what the drawn pads flash.
   *
   * A set with a timer behind it rather than a held set like `heldMidis`,
   * because nothing about a struck drum is held: the sound is already on its
   * way out by the time the hand comes off the pad. The flash says the hit
   * registered, so it lasts long enough to see rather than as long as the
   * finger is down.
   */
  struck: ReadonlySet<DrumPiece>;
  /**
   * Wake the audio context, if it is not awake already.
   *
   * Must be called from inside a real user gesture — a browser will not start
   * audio otherwise. Playing a key does this for you; it is exposed for the
   * controls that make a sound without one, like the click.
   */
  wake(): Promise<void>;
  /** Stop one started by `press`. */
  release(midi: number): void;
  /**
   * Push the pitch of everything sounding, and of anything struck while it is
   * held. `0` lets it come home.
   *
   * Semitones rather than cents because this is the *gesture* — where the hand
   * pushed to — and it is what gets written onto the note. Where the pitch has
   * actually travelled to at any instant is the audio layer's business.
   */
  bend(semitones: number): void;
  /** Where the wheel is pushed, in semitones. 0 when it is home. */
  bendSemitones: number;
  /** Release everything, now. */
  panic(): void;
  /** Start logging presses. Times are compared against the take's downbeat. */
  startLog(): void;
  /**
   * Stop logging and hand back what was played. Notes still held are closed at
   * `endMs` — a chord you were still holding when you hit stop is a chord you
   * played, not a note that never ended.
   */
  stopLog(endMs?: number): { presses: KeyPress[]; bends: BendGesture[] };
  /** How many presses are in the log so far, for the status line. */
  logged: number;
}

export interface KeyboardSynthOptions {
  /** Whether keys should sound at all. False only while no voice is loaded. */
  enabled: boolean;
  /**
   * The pads under the hands, when the loaded voice is a kit.
   *
   * Given, the letter keys strike pieces and stop being a piano: a kit has no
   * pitch, so leaving the note mapping live would have `Z` sound nothing and
   * read as broken. Absent — the usual case — nothing here changes.
   */
  pads?: readonly DrumPad[];
  /** Space and escape, handed to the page — the transport is its business, not the instrument's. */
  onTransport?(action: "toggle" | "panic"): void;
}

/** How long a struck pad stays lit, in milliseconds. Long enough to see at speed. */
const FLASH_MS = 120;

export function useKeyboardSynth(options: KeyboardSynthOptions): KeyboardSynth {
  const { enabled, pads, onTransport } = options;
  const keyboard = useRef<LiveKeyboard | null>(null);
  if (keyboard.current === null) keyboard.current = new LiveKeyboard();

  const [heldMidis, setHeldMidis] = useState<ReadonlySet<number>>(() => new Set());
  const [struck, setStruck] = useState<ReadonlySet<DrumPiece>>(() => new Set());
  const [bendSemitones, setBendSemitones] = useState(0);
  const [octave, setOctave] = useState(DEFAULT_OCTAVE);
  const [velocity, setVelocity] = useState(DEFAULT_VELOCITY);
  const [logged, setLogged] = useState(0);

  // Everything the listeners read and nothing they render: latched into refs so
  // the two window listeners are bound once. Re-binding them per render would
  // drop a keyup between the removal and the addition, which is a stuck note.
  const state = useRef({ enabled, octave, velocity, pads, onTransport });
  state.current = { enabled, octave, velocity, pads, onTransport };

  /** Notes currently down, and the closed presses, while logging. */
  const open = useRef(new Map<number, { downMs: number; velocity: number }>());
  const log = useRef<KeyPress[] | null>(null);
  /** Bend gestures, and the one still being held. */
  const bendLog = useRef<BendGesture[]>([]);
  const openBend = useRef<BendGesture | null>(null);
  /**
   * Keys the player has down *right now*, as distinct from notes the synth is
   * sounding. They are the same thing except across the wake below, where a key
   * can be pressed and released before the audio context has finished starting.
   */
  const intended = useRef(new Set<number>());
  /** The one in-flight `Tone.start()`, so ten fingers do not start ten of them. */
  const waking = useRef<Promise<void> | null>(null);
  /** Flash timers per piece, so a roll re-lights a pad rather than going dark mid-roll. */
  const flashes = useRef(new Map<DrumPiece, number>());

  /**
   * Bring the audio context up.
   *
   * There is no Start button on this page: a browser needs a user gesture
   * before it will make a sound, and *playing a key is a user gesture*. So the
   * first note both wakes the audio and is the first thing you hear, and the
   * page is playable the moment it loads.
   */
  const wake = useCallback((): Promise<void> => {
    if (LiveKeyboard.started) return Promise.resolve();
    waking.current ??= LiveKeyboard.start().finally(() => {
      waking.current = null;
    });
    return waking.current;
  }, []);

  /** Sound a note. Separate from `press` because only this half needs audio. */
  const strike = useCallback((midi: number, velocity: number): void => {
    keyboard.current?.noteOn(midi, velocity);
  }, []);

  const press = useCallback(
    (midi: number, at = performance.now()): void => {
      const { enabled: on, velocity: vel } = state.current;
      if (!on || intended.current.has(midi)) return;
      intended.current.add(midi);

      // Logged and lit here rather than alongside the attack, so both stay true
      // across a wake: what the take records is *what was played*, at the
      // millisecond the key went down, whether or not the audio was ready to
      // make a sound at the time.
      if (log.current && !open.current.has(midi)) open.current.set(midi, { downMs: at, velocity: vel });
      setHeldMidis((now) => new Set(now).add(midi));

      if (LiveKeyboard.started) {
        strike(midi, vel);
        return;
      }
      // First note of the session: it is also the gesture the browser was
      // waiting for. Striking after the wake costs this one note a few
      // milliseconds of audio latency and nothing else — and if the key is
      // already back up by then, it is not struck at all, because a note whose
      // attack arrives after its release is a note that never stops.
      void wake().then(() => {
        if (intended.current.has(midi)) strike(midi, vel);
      });
    },
    [strike, wake],
  );

  /**
   * Strike a kit piece and flash its pad.
   *
   * Same wake dance as `press`, for the same reason — the first pad hit of the
   * session is also the gesture the browser was waiting for — but without its
   * "is it still down" check: a drum struck before the audio was ready is a
   * drum that sounds a few milliseconds late, and there is no release that
   * could arrive first and strand it.
   */
  const hit = useCallback(
    (piece: DrumPiece): void => {
      if (!state.current.enabled) return;
      const vel = state.current.velocity;

      const running = flashes.current.get(piece);
      if (running !== undefined) clearTimeout(running);
      setStruck((now) => (now.has(piece) ? now : new Set(now).add(piece)));
      flashes.current.set(
        piece,
        setTimeout(() => {
          flashes.current.delete(piece);
          setStruck((now) => {
            if (!now.has(piece)) return now;
            const next = new Set(now);
            next.delete(piece);
            return next;
          });
        }, FLASH_MS) as unknown as number,
      );

      if (LiveKeyboard.started) {
        keyboard.current?.hit(piece, vel);
        return;
      }
      void wake().then(() => keyboard.current?.hit(piece, vel));
    },
    [wake],
  );

  const release = useCallback((midi: number, at = performance.now()): void => {
    intended.current.delete(midi);
    keyboard.current?.noteOff(midi);
    const started = open.current.get(midi);
    open.current.delete(midi);
    if (started && log.current) {
      log.current.push({ midi, downMs: started.downMs, upMs: at, velocity: started.velocity });
      setLogged(log.current.length);
    }
    setHeldMidis((now) => {
      if (!now.has(midi)) return now;
      const next = new Set(now);
      next.delete(midi);
      return next;
    });
  }, []);

  /**
   * Push or release the wheel, and record the gesture.
   *
   * The gesture is logged the moment it starts, before anybody knows which note
   * will end up carrying it — at the keyboard a bend belongs to no note in
   * particular. `attachBends` works that out afterwards, from what was ringing.
   */
  const bend = useCallback((semitones: number): void => {
    const at = performance.now();
    if (semitones === 0) {
      keyboard.current?.releaseBend();
      if (openBend.current) {
        openBend.current.releasedMs = at;
        openBend.current = null;
      }
      setBendSemitones(0);
      return;
    }
    keyboard.current?.bendTo(semitones);
    setBendSemitones(semitones);
    if (log.current) {
      const gesture: BendGesture = { atMs: at, semitones };
      bendLog.current.push(gesture);
      openBend.current = gesture;
    }
  }, []);

  const panic = useCallback(() => {
    keyboard.current?.panic();
    open.current.clear();
    intended.current.clear();
    openBend.current = null;
    for (const timer of flashes.current.values()) clearTimeout(timer);
    flashes.current.clear();
    setHeldMidis(new Set());
    setStruck(new Set());
    setBendSemitones(0);
  }, []);

  const startLog = useCallback(() => {
    log.current = [];
    bendLog.current = [];
    openBend.current = null;
    setLogged(0);
  }, []);

  const stopLog = useCallback((endMs = performance.now()) => {
    const presses = log.current ?? [];
    // Close what is still down. These are real notes: the last chord of a take
    // is usually still under the fingers when the recording is stopped.
    for (const [midi, started] of open.current) {
      presses.push({ midi, downMs: started.downMs, upMs: endMs, velocity: started.velocity });
      open.current.delete(midi);
    }
    // A bend still held at the stop is left open rather than closed here: it
    // never came back, and a `release` on the written note would claim it did.
    openBend.current = null;
    const bends = bendLog.current;
    log.current = null;
    bendLog.current = [];
    return {
      presses: presses.sort((a, b) => a.downMs - b.downMs || a.midi - b.midi),
      bends,
    };
  }, []);

  const use = useCallback((instrument: InstrumentName, slug?: string) => {
    keyboard.current?.use(instrument, slug);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && TYPING.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const { octave: oct, onTransport: transport } = state.current;

      switch (event.code) {
        case "ArrowLeft":
        case "ArrowRight":
          event.preventDefault();
          // Moving the hands releases what they were holding: the keys under
          // the fingers now mean different notes, so the keyups that arrive
          // afterwards would be for pitches nobody is playing.
          panic();
          setOctave((now) => shiftOctave(now, event.code === "ArrowRight" ? 1 : -1));
          return;
        case "ArrowUp":
        case "ArrowDown":
          event.preventDefault();
          setVelocity((now) => stepVelocity(now, event.code === "ArrowUp" ? 1 : -1));
          return;
        case "Space":
          event.preventDefault();
          transport?.("toggle");
          return;
        case "Escape":
          panic();
          transport?.("panic");
          return;
      }

      // Auto-repeat: the OS sends keydown over and over while a key is held, and
      // every one of them would be a fresh attack on a note already sounding —
      // or, for a bend, a fresh gesture logged every 30 ms.
      if (event.repeat) return;

      // A kit owns the letter keys while it is loaded: `padForCode` answers
      // first, and a key with no pad on it does nothing rather than falling
      // through to a pitch the kit has no way to play.
      const grid = state.current.pads;
      if (grid && grid.length > 0) {
        const piece = padForCode(event.code, grid);
        if (piece === undefined) return;
        event.preventDefault();
        hit(piece);
        return;
      }

      const direction = bendDirection(event.code);
      if (direction !== undefined) {
        event.preventDefault();
        bend(direction * BEND_SEMITONES);
        return;
      }

      const midi = midiForCode(event.code, oct);
      if (midi === undefined) return;
      // Claim the key even when the audio is asleep, so space and `/` do not
      // scroll the page out from under a player who has not pressed Start yet.
      event.preventDefault();
      press(midi);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      // Nothing to lift off a drum, so the pads never take a keyup.
      const grid = state.current.pads;
      if (grid && grid.length > 0) return;
      if (bendDirection(event.code) !== undefined) {
        bend(0);
        return;
      }
      const midi = midiForCode(event.code, state.current.octave);
      if (midi !== undefined) release(midi);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // The stuck note that is nobody's bug: the window stops receiving keyups
    // the moment it loses focus, so a chord held through an alt-tab would ring
    // until the tab was closed.
    window.addEventListener("blur", panic);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", panic);
    };
  }, [bend, hit, panic, press, release]);

  // Flash timers are the one thing here that outlives a render, so they are
  // cleared with the graph rather than left to fire into an unmounted page.
  useEffect(() => {
    const timers = flashes.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // One teardown for the graph, on unmount only. StrictMode's double-mount in
  // dev disposes and rebuilds it, which is exactly the exercise worth having.
  useEffect(() => {
    const instance = keyboard.current;
    return () => instance?.dispose();
  }, []);

  return {
    heldMidis,
    struck,
    hit,
    bendSemitones,
    octave,
    velocity,
    setOctave,
    setVelocity,
    use,
    press,
    release,
    wake,
    bend,
    panic,
    startLog,
    stopLog,
    logged,
  };
}
