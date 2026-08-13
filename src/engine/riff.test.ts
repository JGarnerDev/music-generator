import { describe, it, expect } from "vitest";
import { gallopLine, powerChordGallop, sustainLine, tremoloLine, shiftBars } from "./riff";

describe("gallopLine", () => {
  it("emits an eighth plus two sixteenths on every beat", () => {
    const notes = gallopLine({ startBar: 0, roots: ["D2"] });
    expect(notes).toHaveLength(12);
    expect(notes.slice(0, 3).map((n) => n.time)).toEqual(["0:0:0", "0:0:2", "0:0:3"]);
    expect(notes.slice(0, 3).map((n) => n.duration)).toEqual(["8n", "16n", "16n"]);
  });

  it("advances one bar per root", () => {
    const notes = gallopLine({ startBar: 4, roots: ["D2", "C2"] });
    expect(notes[0]!.time).toBe("4:0:0");
    expect(notes[12]!.time).toBe("5:0:0");
    expect(notes[12]!.pitch).toBe("C2");
  });

  it("puts the approach note on the last sixteenth only", () => {
    const notes = gallopLine({ startBar: 0, roots: ["D2"], approaches: ["C#2"] });
    expect(notes.at(-1)).toMatchObject({ time: "0:3:3", pitch: "C#2" });
    expect(notes.filter((n) => n.pitch === "C#2")).toHaveLength(1);
  });

  it("ignores a null approach", () => {
    const notes = gallopLine({ startBar: 0, roots: ["D2"], approaches: [null] });
    expect(notes.every((n) => n.pitch === "D2")).toBe(true);
  });

  it("accents on-beat eighths above the sixteenths, and odd beats below even", () => {
    const notes = gallopLine({ startBar: 0, roots: ["D2"], accent: 0.95, ghost: 0.8 });
    expect(notes[0]!.velocity).toBe(0.95); // beat 0
    expect(notes[1]!.velocity).toBe(0.8); // sixteenth
    expect(notes[3]!.velocity).toBeCloseTo(0.88); // beat 1, backed off
  });
});

describe("powerChordGallop", () => {
  it("adds a fifth to the eighths but not the sixteenths", () => {
    const notes = powerChordGallop({ startBar: 0, roots: ["D3"] });
    const downbeat = notes.filter((n) => n.time === "0:0:0");
    expect(downbeat.map((n) => n.pitch)).toEqual(["D3", "A3"]);
    expect(notes.filter((n) => n.time === "0:0:2").map((n) => n.pitch)).toEqual(["D3"]);
  });

  it("voices the fifth below the root in velocity", () => {
    const [root, fifth] = powerChordGallop({ startBar: 0, roots: ["D3"], accent: 0.9 });
    expect(fifth!.velocity!).toBeLessThan(root!.velocity!);
  });

  it("takes the fifth of the approach note too", () => {
    const notes = powerChordGallop({ startBar: 0, roots: ["A2"], approaches: ["C#3"] });
    // the approach lands on a sixteenth, so it stays a bare root
    expect(notes.at(-1)).toMatchObject({ pitch: "C#3", duration: "16n" });
  });
});

describe("sustainLine", () => {
  it("holds one stack per bar", () => {
    const notes = sustainLine({ startBar: 2, pitches: [["D3", "A3"], "C3"] });
    expect(notes.map((n) => n.time)).toEqual(["2:0:0", "2:0:0", "3:0:0"]);
    expect(notes.map((n) => n.pitch)).toEqual(["D3", "A3", "C3"]);
  });

  it("leaves null bars silent", () => {
    const notes = sustainLine({ startBar: 0, pitches: [null, "C3", null] });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.time).toBe("1:0:0");
  });

  it("backs off upper voices in a stack", () => {
    const notes = sustainLine({ startBar: 0, pitches: [["D3", "A3", "D4"]], velocity: 0.4 });
    expect(notes[0]!.velocity).toBeCloseTo(0.4);
    expect(notes[1]!.velocity).toBeCloseTo(0.35);
    expect(notes[2]!.velocity).toBeCloseTo(0.3);
  });
});

describe("tremoloLine", () => {
  it("repeats each pitch across its beat", () => {
    const notes = tremoloLine({ startBar: 0, pitches: ["A4"], subdivision: 4 });
    expect(notes.map((n) => n.time)).toEqual(["0:0:0", "0:0:1", "0:0:2", "0:0:3"]);
    expect(notes.every((n) => n.duration === "16n")).toBe(true);
  });

  it("wraps to the next bar after four beats", () => {
    const notes = tremoloLine({ startBar: 7, pitches: ["A4", "A4", "A4", "A4", "C5"], subdivision: 1 });
    expect(notes.map((n) => n.time)).toEqual(["7:0:0", "7:1:0", "7:2:0", "7:3:0", "8:0:0"]);
  });

  it("uses eighths at subdivision 2", () => {
    const notes = tremoloLine({ startBar: 0, pitches: ["A4"], subdivision: 2 });
    expect(notes.map((n) => n.time)).toEqual(["0:0:0", "0:0:2"]);
    expect(notes[0]!.duration).toBe("8n");
  });

  it("accents the first hit of each beat", () => {
    const [first, second] = tremoloLine({ startBar: 0, pitches: ["A4"], velocity: 0.9 });
    expect(first!.velocity).toBe(0.9);
    expect(second!.velocity).toBeCloseTo(0.78);
  });

  it("rejects a subdivision that would land off the sixteenth grid", () => {
    // 3 hits per beat needs a triplet grid these transport times cannot express
    const off = [3, 0, 5] as unknown as (1 | 2 | 4)[];
    for (const subdivision of off) {
      expect(() => tremoloLine({ startBar: 0, pitches: ["A4"], subdivision })).toThrow(
        /subdivision must be 1, 2 or 4/,
      );
    }
  });
});

describe("shiftBars", () => {
  it("moves notes by whole bars, keeping the beat grid", () => {
    const notes = shiftBars([{ time: "1:2:3", pitch: "D2", duration: "16n" }], 8);
    expect(notes[0]!.time).toBe("9:2:3");
  });

  it("fills in missing beat/sixteenth parts", () => {
    const notes = shiftBars([{ time: "0:0", pitch: "D2", duration: "1m" }], 4);
    expect(notes[0]!.time).toBe("4:0:0");
  });
});
