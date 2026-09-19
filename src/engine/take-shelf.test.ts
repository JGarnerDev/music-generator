import { describe, expect, it } from "vitest";
import {
  SHELF_LIMIT,
  forget,
  parseShelf,
  serializeShelf,
  shelve,
  takeFileName,
  takeJson,
} from "./take-shelf";
import type { Take } from "./take";

function take(name: string, extra: Partial<Take> = {}): Take {
  return {
    name,
    recordedAt: "2026-09-18T10:00:00.000Z",
    bpm: 90,
    key: "Am",
    instrument: "piano",
    grid: 4,
    notes: [{ step: 0, midi: 60, lengthSteps: 4, velocity: 0.8 }],
    ...extra,
  } as Take;
}

describe("takeFileName", () => {
  it("is the name the CLI reads back", () => {
    expect(takeFileName(take("tavern-hook"))).toBe("tavern-hook.take.json");
  });
});

describe("takeJson", () => {
  it("matches what the dev server writes — two spaces and a trailing newline", () => {
    const json = takeJson(take("tavern-hook"));
    expect(json.endsWith("}\n")).toBe(true);
    expect(json).toContain('\n  "name": "tavern-hook"');
    expect(JSON.parse(json).notes).toHaveLength(1);
  });
});

describe("shelve", () => {
  it("puts the newest first", () => {
    const shelf = shelve(shelve([], take("one")), take("two"));
    expect(shelf.map((held) => held.name)).toEqual(["two", "one"]);
  });

  it("replaces a take of the same name rather than stacking re-readings", () => {
    const shelf = shelve([take("hook", { bpm: 90 }), take("other")], take("hook", { bpm: 120 }));
    expect(shelf.map((held) => held.name)).toEqual(["hook", "other"]);
    expect(shelf[0]!.bpm).toBe(120);
  });

  it("drops the oldest past the limit", () => {
    let shelf: Take[] = [];
    for (let i = 0; i < SHELF_LIMIT + 3; i += 1) shelf = shelve(shelf, take(`take-${i}`));
    expect(shelf).toHaveLength(SHELF_LIMIT);
    expect(shelf[0]!.name).toBe(`take-${SHELF_LIMIT + 2}`);
    expect(shelf.some((held) => held.name === "take-0")).toBe(false);
  });

  it("takes a smaller limit when asked", () => {
    const shelf = shelve([take("a"), take("b")], take("c"), 2);
    expect(shelf.map((held) => held.name)).toEqual(["c", "a"]);
  });
});

describe("forget", () => {
  it("removes one by name and leaves the rest in order", () => {
    expect(forget([take("a"), take("b"), take("c")], "b").map((held) => held.name)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("parseShelf", () => {
  it("round-trips a shelf", () => {
    const shelf = [take("a"), take("b")];
    expect(parseShelf(serializeShelf(shelf)).map((held) => held.name)).toEqual(["a", "b"]);
  });

  it("never throws — it runs on mount, before there is a page to show an error on", () => {
    expect(parseShelf(null)).toEqual([]);
    expect(parseShelf("")).toEqual([]);
    expect(parseShelf("{not json")).toEqual([]);
    expect(parseShelf('{"takes":[]}')).toEqual([]);
  });

  it("drops entries that are not usable takes", () => {
    const raw = JSON.stringify([take("good"), { name: "bad", notes: [] }, 7]);
    expect(parseShelf(raw).map((held) => held.name)).toEqual(["good"]);
  });
});
