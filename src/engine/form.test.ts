import { describe, it, expect } from "vitest";
import { buildForm, contrastProgression, formBars, isFormName, type FormOptions } from "./form";
import { makeRng, seedFromString } from "@utils/random";

const two = [
  ["i", "VI", "III", "VII"],
  ["i", "iv", "i", "V"],
];

const opts = (over: Partial<FormOptions> = {}): FormOptions => ({
  form: "sample",
  progressions: two,
  tonic: "A",
  scale: "minor",
  rng: makeRng(seedFromString("seed")),
  ...over,
});

describe("buildForm — sample", () => {
  it("states a phrase and restates it, and nothing else", () => {
    const form = buildForm(opts());
    expect(form.map((s) => s.role)).toEqual(["A", "restate"]);
  });

  it("restates the same harmony", () => {
    const [a, restate] = buildForm(opts());
    expect(restate!.chords).toEqual(a!.chords);
  });

  it("changes the staging on the restatement, so a repeat is an event", () => {
    const [a, restate] = buildForm(opts());
    expect(restate!.arp).toBe(true);
    expect(a!.arp).toBe(false);
    expect(restate!.invert).toBe(true);
    expect(restate!.intensity).toBeGreaterThan(a!.intensity);
    expect(restate!.figure).not.toBe(a!.figure);
  });
});

describe("buildForm — song", () => {
  it("puts an intro in front and a B section in the middle", () => {
    const form = buildForm(opts({ form: "song" }));
    expect(form.map((s) => s.role)).toEqual(["intro", "A", "B", "restate"]);
  });

  it("gives B different harmony — the whole reason it exists", () => {
    const form = buildForm(opts({ form: "song" }));
    const a = form.find((s) => s.role === "A")!;
    const b = form.find((s) => s.role === "B")!;
    expect(b.chords).not.toEqual(a.chords);
  });

  it("returns to A's harmony afterwards, so B is a departure", () => {
    const form = buildForm(opts({ form: "song" }));
    const a = form.find((s) => s.role === "A")!;
    const restate = form.find((s) => s.role === "restate")!;
    expect(restate.chords).toEqual(a.chords);
  });

  it("keeps the intro shorter than the verse and puts no tune on it", () => {
    const form = buildForm(opts({ form: "song" }));
    const intro = form[0]!;
    const a = form[1]!;
    expect(intro.chords.length).toBeLessThan(a.chords.length);
    expect(intro.melody).toBe(false);
    expect(intro.intensity).toBeLessThan(a.intensity);
  });

  it("lays the sections out end to end with no gap or overlap", () => {
    const form = buildForm(opts({ form: "song" }));
    let bar = 0;
    for (const s of form) {
      expect(s.startBar).toBe(bar);
      bar += s.chords.length;
    }
    expect(formBars(form)).toBe(bar);
  });

  it("is longer than a sample, which is the point of asking for it", () => {
    expect(formBars(buildForm(opts({ form: "song" })))).toBeGreaterThan(
      formBars(buildForm(opts())),
    );
  });
});

describe("contrastProgression", () => {
  it("prefers a second progression the palette actually wrote", () => {
    const rng = makeRng(seedFromString("s"));
    expect(contrastProgression(two, two[0]!, rng)).toEqual(two[1]);
  });

  it("rotates the only progression when there is no second one", () => {
    const rng = makeRng(seedFromString("s"));
    const only = [["i", "VII", "VI", "V"]];
    const b = contrastProgression(only, only[0]!, rng);
    expect(b).not.toEqual(only[0]);
    // Same chords, arriving in a different order and landing somewhere else.
    expect([...b].sort()).toEqual([...only[0]!].sort());
    expect(b[0]).not.toBe("i");
  });

  it("gives up gracefully on a one-chord progression", () => {
    const rng = makeRng(seedFromString("s"));
    expect(contrastProgression([["i"]], ["i"], rng)).toEqual(["i"]);
  });
});

describe("determinism", () => {
  it("gives the same form for the same seed", () => {
    expect(buildForm(opts({ form: "song" }))).toEqual(buildForm(opts({ form: "song" })));
  });

  it("resolves numerals against the key's own mode", () => {
    // D dorian's major IV is the mode's whole point.
    const form = buildForm(
      opts({ progressions: [["i", "IV", "i", "VII"]], tonic: "D", scale: "dorian" }),
    );
    expect(form[0]!.chords).toEqual(["Dm", "G", "Dm", "C"]);
  });
});

describe("isFormName", () => {
  it("knows its own shapes and nothing else", () => {
    expect(isFormName("song")).toBe(true);
    expect(isFormName("sample")).toBe(true);
    expect(isFormName("epic")).toBe(false);
  });
});
