import { describe, expect, it } from "vitest";
import { INSTRUMENT_NAMES } from "./composition";
import type { SynthSpec, VoicePreset } from "./voice";
import {
  LEGEND,
  armedMessage,
  clickMessage,
  recordLabel,
  openingMessage,
  playability,
  playableInstruments,
  readyMessage,
  recordingMessage,
  savedMessage,
  stateLine,
  stoppedMessage,
  takeHeader,
  takePath,
} from "./keys-bench";
import { buildTake } from "./take";

const SYNTH = { kind: "synth", oscillator: { type: "triangle" }, envelope: {} } as unknown as SynthSpec;

function preset(over: Partial<VoicePreset> = {}): VoicePreset {
  return { instrument: "piano", slug: "felt", title: "Felt", status: "approved", synth: SYNTH, ...over };
}

describe("playability", () => {
  it("plays an ordinary pitched voice with nothing to say about it", () => {
    expect(playability(preset())).toEqual({ playable: true, note: "" });
  });

  it("refuses drums, which have no pitch", () => {
    const kit = preset({ instrument: "drums", synth: undefined, kit: {} as never });
    const verdict = playability(kit);
    expect(verdict.playable).toBe(false);
    expect(verdict.note).toContain("no pitch");
  });

  it("refuses a section, and says what to do instead", () => {
    const desk = preset({ section: { players: 8 } as never });
    const verdict = playability(desk);
    expect(verdict.playable).toBe(false);
    expect(verdict.note).toContain("solo voice");
  });

  it("refuses a pitched voice with no synth rather than throwing at trigger time", () => {
    expect(playability(preset({ synth: undefined })).playable).toBe(false);
  });

  it("plays an amped voice but warns it is the heavy one", () => {
    const verdict = playability(preset({ instrument: "lead", amp: {} as never }));
    expect(verdict.playable).toBe(true);
    expect(verdict.note).toContain("crackle");
  });
});

describe("the status line", () => {
  it("tells a read-only build what it is missing", () => {
    expect(openingMessage(12, false)).toContain("npm run dev");
    expect(openingMessage(12, true)).not.toContain("npm run dev");
  });

  it("counts the shelf in the plural it deserves", () => {
    expect(openingMessage(1, true)).toContain("1 voice on");
    expect(openingMessage(2, true)).toContain("2 voices on");
  });

  it("appends the playability note only when there is one", () => {
    expect(readyMessage("piano/felt", "")).toBe("piano/felt ready.");
    expect(readyMessage("lead/molten", "Amped.")).toBe("lead/molten ready. Amped.");
  });

  it("says what arming is waiting for", () => {
    expect(armedMessage(96)).toContain("next downbeat");
    expect(armedMessage(96)).toContain("96 BPM");
  });

  it("says what the click being off means for recording", () => {
    expect(clickMessage(true, 96)).toContain("96 BPM");
    expect(clickMessage(false, 96)).toContain("the moment you press Record");
  });

  it("says nothing was played rather than claiming a recording", () => {
    expect(recordingMessage(0)).toContain("nothing played yet");
    expect(stoppedMessage(0)).toContain("nothing to save");
  });

  it("pluralises the note count", () => {
    expect(recordingMessage(1)).toContain("1 note.");
    expect(recordingMessage(4)).toContain("4 notes.");
  });

  it("hands over the path and both ways to read it", () => {
    const message = savedMessage(takePath("tavern-hook"));
    expect(message).toContain("recordings/keys/tavern-hook.take.json");
    expect(message).toContain("npm run take:read");
  });

  it("says where the hands are", () => {
    expect(stateLine(3, 0.6, 0)).toBe("octave 3 (Z = C3) · velocity 0.6");
    expect(stateLine(4, 1, 2)).toContain("2 sounding");
  });

  it("shows the bend only while the pitch is actually off", () => {
    expect(stateLine(4, 0.8, 1, 0)).not.toContain("bend");
    expect(stateLine(4, 0.8, 1, 200)).toContain("bend +2.00 st");
    expect(stateLine(4, 0.8, 1, -117)).toContain("bend -1.17 st");
  });

  it("never claims to be recording while it is only waiting", () => {
    expect(recordLabel("idle")).toBe("Record");
    expect(recordLabel("armed")).toContain("waiting");
    expect(recordLabel("recording")).toBe("Stop");
  });

  it("documents every control the page binds", () => {
    for (const control of ["octave", "velocity", "bend", "space", "esc"]) {
      expect(LEGEND).toContain(control);
    }
  });
});

describe("takeHeader", () => {
  const base = { name: "t", bpm: 90, key: "Am", instrument: "piano" as const, presses: [] };

  it("names the voice, the grid and whether notes were cut", () => {
    const take = buildTake({
      ...base,
      voice: "felt",
      presses: [{ midi: 60, downMs: 0, upMs: 500, velocity: 0.8 }],
    });
    expect(takeHeader(take)).toBe("piano/felt · sixteenths · held as played");
  });

  it("says so when no voice was named", () => {
    const take = buildTake({ ...base, presses: [{ midi: 60, downMs: 0, upMs: 500, velocity: 0.8 }] });
    expect(takeHeader(take)).toContain("default voice");
  });

  it("names a coarser grid and a cut take", () => {
    const take = buildTake({
      ...base,
      grid: 1,
      monophonic: true,
      presses: [{ midi: 60, downMs: 0, upMs: 500, velocity: 0.8 }],
    });
    expect(takeHeader(take)).toBe("piano (default voice) · quarters · cut at the next onset");
  });
});

describe("playableInstruments", () => {
  it("drops drums and keeps the rest in order", () => {
    const playable = playableInstruments(INSTRUMENT_NAMES);
    expect(playable).not.toContain("drums");
    expect(playable.length).toBe(INSTRUMENT_NAMES.length - 1);
  });
});
