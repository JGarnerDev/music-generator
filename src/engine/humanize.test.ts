import { describe, it, expect } from "vitest";
import { HOUSE_LEANS, humanize, humanizeParts } from "./humanize";
import type { Note } from "./composition";
import { barsBeatsToSeconds } from "@utils/timing";

const at = (time: string, pitch = "A2", velocity = 0.7): Note => ({
  time,
  pitch,
  duration: "16n",
  velocity,
});

/** A bar of straight sixteenths, all on the same accent character. */
const bar = Array.from({ length: 16 }, (_, i) => at(`0:${Math.floor(i / 4)}:${i % 4}`));

const seconds = (n: Note) => barsBeatsToSeconds(n.time, 120);

describe("humanize", () => {
  it("is deterministic for a seed", () => {
    expect(humanize(bar, { seed: "take-1" })).toEqual(humanize(bar, { seed: "take-1" }));
  });

  it("gives a different performance on a different seed", () => {
    expect(humanize(bar, { seed: "take-1" })).not.toEqual(humanize(bar, { seed: "take-2" }));
  });

  it("stops two notes on the same accent being bit-identical", () => {
    // The whole complaint: a straight bar of one character used to be sixteen
    // copies of one note at four-sixteenth spacing.
    const played = humanize(bar, { seed: "s" });
    expect(new Set(played.map((n) => n.velocity)).size).toBeGreaterThan(8);
    const gaps = played.slice(1).map((n, i) => seconds(n) - seconds(played[i]!));
    expect(new Set(gaps.map((g) => g.toFixed(6))).size).toBeGreaterThan(8);
  });

  it("moves notes by feel, not by a note value", () => {
    const played = humanize(bar, { seed: "s", jitter: 0.1 });
    for (const [i, note] of played.entries()) {
      const moved = Math.abs(seconds(note) - seconds(bar[i]!));
      // A tenth of a sixteenth at 120bpm is 12.5ms — under a thirty-second note.
      expect(moved).toBeLessThan(barsBeatsToSeconds("0:0:0.1", 120) + 1e-9);
    }
  });

  it("keeps velocities in range and never silences a note", () => {
    const loud = humanize([at("0:0:0", "A2", 1)], { seed: "s", dynamics: 0.5 });
    const quiet = humanize([at("0:0:0", "A2", 0.01)], { seed: "s", dynamics: 0.5 });
    expect(loud[0]!.velocity).toBeLessThanOrEqual(1);
    expect(quiet[0]!.velocity).toBeGreaterThan(0);
  });

  it("leaves a note without a velocity alone rather than inventing one", () => {
    const bare: Note = { time: "0:0:0", pitch: "A2", duration: "16n" };
    expect(humanize([bare], { seed: "s" })[0]!.velocity).toBeUndefined();
  });

  it("never moves a note before the start of the piece", () => {
    const played = humanize([at("0:0:0")], { seed: "s", lean: -2, jitter: 1 });
    expect(played[0]!.time).toBe("0:0:0");
  });

  it("holds a note inside its own bar, where its chord is", () => {
    // Dragged hard off the end of bar 0 — but every part is written against the
    // chord of the bar it is in, so leaving the bar would sound a wrong note.
    const played = humanize([at("0:3:3")], { seed: "s", lean: 4, jitter: 0 });
    expect(played[0]!.time.startsWith("0:")).toBe(true);
  });

  it("counts the bar in the piece's meter", () => {
    // A bar of 3/4 ends after 12 sixteenths, so the clamp has to land there and
    // not at the 16 a 4/4 bar would allow.
    const played = humanize([at("0:2:3")], { seed: "s", lean: 4, jitter: 0, meter: [3, 4] });
    const [barStr, beatStr] = played[0]!.time.split(":");
    expect(barStr).toBe("0");
    expect(Number(beatStr)).toBeLessThan(3);
  });

  it("lets a caller opt into crossing the barline", () => {
    const played = humanize([at("0:3:3")], { seed: "s", lean: 1, jitter: 0, crossBarlines: true });
    expect(played[0]!.time).toBe("1:0:0");
  });

  it("can only drag a downbeat late and only push a last step early", () => {
    const downbeat = humanize([at("1:0:0")], { seed: "s", lean: -4, jitter: 0 });
    expect(downbeat[0]!.time).toBe("1:0:0");
    const lastStep = humanize([at("1:3:3")], { seed: "s", lean: 4, jitter: 0 });
    expect(seconds(lastStep[0]!)).toBeGreaterThanOrEqual(seconds(at("1:3:3")));
    expect(seconds(lastStep[0]!)).toBeLessThan(seconds(at("2:0:0")));
  });
});

describe("lean", () => {
  it("is a constant offset, not more randomness", () => {
    // The last step is left out: it is against the bar clamp, so it cannot take
    // the full lean and would look like an exception to a rule it isn't one to.
    const inBar = bar.slice(0, -1);
    const straight = humanize(inBar, { seed: "s", jitter: 0 });
    const dragged = humanize(inBar, { seed: "s", jitter: 0, lean: 0.25 });
    const shifts = dragged.map((n, i) => seconds(n) - seconds(straight[i]!));
    // Every note moved by the same amount — that is what makes it a feel.
    expect(new Set(shifts.map((s) => s.toFixed(9))).size).toBe(1);
  });

  it("pushes ahead on a negative lean and drags on a positive one", () => {
    const ahead = humanize([at("1:0:0")], { seed: "s", jitter: 0, lean: -0.5 });
    const behind = humanize([at("1:0:0")], { seed: "s", jitter: 0, lean: 0.5 });
    expect(seconds(ahead[0]!)).toBeLessThan(seconds(behind[0]!));
  });
});

describe("lock", () => {
  it("keeps locked parts simultaneous — a flam is not two players", () => {
    const kick = bar.map((n) => ({ ...n, pitch: "kick" }));
    const bass = humanize(bar, { seed: "bass", lock: "rhythm" });
    const drums = humanize(kick, { seed: "drums", lock: "rhythm" });
    expect(bass.map((n) => n.time)).toEqual(drums.map((n) => n.time));
  });

  it("still gives each locked part its own weight", () => {
    const kick = bar.map((n) => ({ ...n, pitch: "kick" }));
    const bass = humanize(bar, { seed: "bass", lock: "rhythm" });
    const drums = humanize(kick, { seed: "drums", lock: "rhythm" });
    expect(bass.map((n) => n.velocity)).not.toEqual(drums.map((n) => n.velocity));
  });

  it("leaves unlocked parts free to move on their own", () => {
    const a = humanize(bar, { seed: "a" });
    const b = humanize(bar, { seed: "b" });
    expect(a.map((n) => n.time)).not.toEqual(b.map((n) => n.time));
  });
});

describe("humanizeParts", () => {
  it("keeps two parts playing the same rhythm from jittering in lockstep", () => {
    // Same notes in both parts: if they shared a seed they would move together
    // and read as one wide instrument rather than two players.
    const { bass, lead } = humanizeParts({ bass: bar, lead: bar }, { seed: "s" });
    expect(bass.map((n) => n.time)).not.toEqual(lead.map((n) => n.time));
  });

  it("gives each part its own lean", () => {
    const { drums, pad } = humanizeParts(
      { drums: [at("1:0:0")], pad: [at("1:0:0")] },
      { seed: "s", jitter: 0, leans: HOUSE_LEANS },
    );
    // The pad sits behind the kit, which is where a sustained voice belongs.
    expect(seconds(pad[0]!)).toBeGreaterThan(seconds(drums[0]!));
  });

  it("locks bass to the kit, because that is what tight means", () => {
    expect(HOUSE_LEANS.bass).toBe(HOUSE_LEANS.drums);
  });

  it("is deterministic across parts", () => {
    const once = humanizeParts({ a: bar, b: bar }, { seed: "s" });
    const twice = humanizeParts({ a: bar, b: bar }, { seed: "s" });
    expect(once).toEqual(twice);
  });
});
