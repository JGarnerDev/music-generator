import { describe, it, expect } from "vitest";
import { describeLoad, titleOf } from "./bench";
import type { Composition } from "./composition";

const comp = (over: Partial<Composition> = {}): Composition => ({
  name: "piece",
  bpm: 90,
  key: "A minor",
  tracks: [{ instrument: "piano", notes: [{ time: "0:0", pitch: "A3", duration: "4n" }] }],
  ...over,
});

describe("titleOf", () => {
  it("reads name, key and tempo", () => {
    expect(titleOf(comp())).toBe("piece — A minor @ 90 BPM");
  });
});

describe("describeLoad", () => {
  it("adopts a valid one-shot and says it has no loop window", () => {
    const loaded = describeLoad(comp(), "segments/piece");
    expect(loaded.composition).not.toBeNull();
    expect(loaded.title).toBe("piece — A minor @ 90 BPM");
    expect(loaded.status).toBe("Ready. One-shot piece — no loop window.");
  });

  it("reports the loop window in bars", () => {
    const loaded = describeLoad(comp({ loop: { startBar: 2, endBar: 10 } }), "loops/piece");
    expect(loaded.status).toBe("Ready. Loops bars 2–10 (8 bars).");
  });

  it("rejects an invalid piece by source, and leaves the title alone", () => {
    const loaded = describeLoad({ name: "x" }, "dropped.json");
    expect(loaded.composition).toBeNull();
    expect(loaded.title).toBeNull();
    expect(loaded.status).toMatch(/^Invalid dropped\.json: /);
  });
});
