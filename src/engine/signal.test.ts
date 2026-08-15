import { describe, it, expect } from "vitest";
import { SIGNAL_TOKENS, isDry, signalChain, unknownSignal } from "./signal";
import { loadPalettesFromDir } from "./palette-loader";
import { resolve } from "node:path";

describe("signalChain", () => {
  it("builds the effects a token names", () => {
    expect(signalChain(["overdrive"])).toEqual([{ kind: "distortion", amount: 0.35 }]);
  });

  it("keeps the author's order — the order is the instrument", () => {
    // Sag before drive is an amp browning out; drive before sag is a
    // compressor on a fuzz pedal, and they do not sound alike.
    const sagFirst = signalChain(["variac-sag", "overdrive"]).map((e) => e.kind);
    const driveFirst = signalChain(["overdrive", "variac-sag"]).map((e) => e.kind);
    expect(sagFirst).toEqual(["compress", "distortion"]);
    expect(driveFirst).toEqual(["distortion", "compress"]);
  });

  it("expands one word into the several nodes it really is", () => {
    // Fuzz is as much what it removes as what it adds.
    expect(signalChain(["fuzz"]).map((e) => e.kind)).toEqual([
      "distortion",
      "filter",
      "filter",
    ]);
  });

  it("ignores a word with no effect behind it — a timbre is prose first", () => {
    expect(signalChain(["hard-double-track", "moonlight", "overdrive"])).toEqual([
      { kind: "widen", amount: 0.02 },
      { kind: "distortion", amount: 0.35 },
    ]);
  });

  it("matches exactly rather than fuzzily", () => {
    // `deriveLofi`'s regexes matched /space/ as a reverb, so a palette merely
    // mentioning outer space grew a hall.
    expect(signalChain(["space"])).toEqual([]);
    expect(signalChain(["reverberations"])).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(signalChain(["Overdrive"])).toEqual(signalChain(["overdrive"]));
  });

  it("returns nothing for nothing", () => {
    expect(signalChain([])).toEqual([]);
  });
});

describe("unknownSignal", () => {
  it("names the words that are still only words", () => {
    expect(unknownSignal(["overdrive", "moonlight"])).toEqual(["moonlight"]);
  });

  it("stays quiet about words that mean 'do nothing'", () => {
    expect(unknownSignal(["dry", "vinyl-crackle", "hiss"])).toEqual([]);
  });
});

describe("isDry", () => {
  it("reads a deliberate refusal of ambience", () => {
    expect(isDry(["fuzz", "band-limit", "dry"])).toBe(true);
    expect(isDry(["plate-reverb"])).toBe(false);
  });
});

describe("the shipped timbres", () => {
  const palettes = loadPalettesFromDir(resolve(process.cwd(), "palettes"));
  const timbres = palettes.filter((p) => p.frontmatter.kind === "timbre");

  it("finds some to check", () => {
    expect(timbres.length).toBeGreaterThan(0);
  });

  it("each builds at least one real effect, so no timbre is silent prose", () => {
    for (const t of timbres) {
      const signal = (t.frontmatter as { signal?: string[] }).signal ?? [];
      expect(signalChain(signal).length, `${t.frontmatter.slug} builds nothing`).toBeGreaterThan(0);
    }
  });

  it("reports which of their words are still unimplemented", () => {
    // Not a failure — a record. If this list grows, the table below it should.
    const outstanding = timbres.flatMap((t) =>
      unknownSignal((t.frontmatter as { signal?: string[] }).signal ?? []),
    );
    expect(outstanding).toEqual([]);
  });
});

describe("the token table", () => {
  it("names every token it can build", () => {
    expect(SIGNAL_TOKENS.length).toBeGreaterThan(20);
    for (const token of SIGNAL_TOKENS) {
      expect(signalChain([token]).length, token).toBeGreaterThan(0);
    }
  });
});
