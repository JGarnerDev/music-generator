import { describe, expect, it } from "vitest";
import type { Note } from "./composition";
import { splitBySound } from "./section-sound";

const at = (time: string, pitch = "C4"): Note => ({ time, pitch, duration: "4n" });

describe("splitBySound", () => {
  it("keeps one part when no section asks for a different sound", () => {
    const parts = splitBySound([at("0:0:0"), at("3:2:0")], [], {
      voice: "string-section",
      gain: 0.8,
    });
    expect(parts).toEqual([
      { voice: "string-section", gain: 0.8, notes: [at("0:0:0"), at("3:2:0")] },
    ]);
  });

  it("moves a section's notes onto a track for its own voice", () => {
    const parts = splitBySound(
      [at("0:0:0"), at("4:0:0"), at("8:0:0")],
      [{ start: 4, end: 8, voice: "wood-flute" }],
      { voice: "string-section", gain: 0.8 },
    );
    expect(parts).toEqual([
      { voice: "string-section", gain: 0.8, notes: [at("0:0:0"), at("8:0:0")] },
      { voice: "wood-flute", gain: 0.8, notes: [at("4:0:0")] },
    ]);
  });

  it("gives a sound that returns the same track rather than a second one", () => {
    const parts = splitBySound(
      [at("0:0:0"), at("4:0:0"), at("8:0:0")],
      [
        { start: 0, end: 4, voice: "soprano-wordless" },
        { start: 8, end: 12, voice: "soprano-wordless" },
      ],
      { gain: 0.8 },
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ gain: 0.8, notes: [at("4:0:0")] });
    expect(parts[1]!.notes).toEqual([at("0:0:0"), at("8:0:0")]);
  });

  it("splits on gain as well as voice", () => {
    const parts = splitBySound([at("0:0:0"), at("1:0:0")], [{ start: 1, end: 2, gain: 0.3 }], {
      voice: "sludge-stack",
      gain: 0.8,
    });
    expect(parts.map((p) => [p.voice, p.gain])).toEqual([
      ["sludge-stack", 0.8],
      ["sludge-stack", 0.3],
    ]);
  });

  it("silences a section at gain 0 by dropping its notes", () => {
    const parts = splitBySound([at("0:0:0"), at("1:0:0")], [{ start: 1, end: 2, gain: 0 }], {
      gain: 0.8,
    });
    expect(parts).toEqual([{ gain: 0.8, notes: [at("0:0:0")] }]);
  });

  it("files a note by its onset, so a chord held over the seam stays in one hand", () => {
    const held = { time: "3:2:0", pitch: "D4", duration: "1m" };
    const parts = splitBySound([held], [{ start: 4, end: 8, voice: "violin-arco" }], { gain: 1 });
    expect(parts).toEqual([{ gain: 1, notes: [held] }]);
  });

  it("drops the plan's own part when every note moved elsewhere", () => {
    const parts = splitBySound([at("2:0:0")], [{ start: 0, end: 4, voice: "violin-arco" }], {
      voice: "string-section",
      gain: 0.8,
    });
    expect(parts).toEqual([{ voice: "violin-arco", gain: 0.8, notes: [at("2:0:0")] }]);
  });
});
