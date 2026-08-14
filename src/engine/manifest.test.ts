import { describe, expect, it } from "vitest";
import {
  audioName,
  indexManifest,
  mergeManifest,
  renderManifest,
  type ManifestEntry,
} from "./manifest";

const entry = (name: string, isLoop = false): ManifestEntry => ({
  name,
  file: `${name}.mp3`,
  seconds: 12,
  bytes: 1000,
  isLoop,
  renderedAt: "2026-08-13T00:00:00.000Z",
});

describe("renderManifest", () => {
  it("sorts by name so a re-render diffs cleanly", () => {
    const json = renderManifest([entry("vulture-mile"), entry("ashen-king")]);
    const names = (JSON.parse(json) as { entries: ManifestEntry[] }).entries.map((e) => e.name);
    expect(names).toEqual(["ashen-king", "vulture-mile"]);
  });

  it("ends with a newline, like every other file the repo writes", () => {
    expect(renderManifest([entry("a")]).endsWith("}\n")).toBe(true);
  });

  it("handles an empty render", () => {
    expect(JSON.parse(renderManifest([]))).toEqual({ entries: [] });
  });
});

describe("indexManifest", () => {
  it("indexes by name", () => {
    const index = indexManifest({ entries: [entry("ashen-king"), entry("x.loop", true)] });
    expect(index.get("ashen-king")?.file).toBe("ashen-king.mp3");
    expect(index.get("x.loop")?.isLoop).toBe(true);
  });

  it("treats a missing or malformed manifest as nothing rendered", () => {
    for (const bad of [undefined, null, {}, { entries: "nope" }, 42]) {
      expect(indexManifest(bad).size).toBe(0);
    }
  });

  it("drops entries that are missing a name or file", () => {
    const index = indexManifest({ entries: [entry("good"), { name: "no-file" }, { file: "x" }] });
    expect([...index.keys()]).toEqual(["good"]);
  });
});

describe("mergeManifest", () => {
  const on = (...files: string[]) => new Set(files);

  it("keeps earlier entries a partial run didn't touch", () => {
    const merged = mergeManifest([entry("old")], [entry("new")], on("old.mp3", "new.mp3"));
    expect(merged.map((e) => e.name).sort()).toEqual(["new", "old"]);
  });

  it("lets a fresh render replace the previous entry", () => {
    const stale = { ...entry("x"), bytes: 1, renderedAt: "2020-01-01T00:00:00.000Z" };
    const [only] = mergeManifest([stale], [entry("x")], on("x.mp3"));
    expect(only!.bytes).toBe(1000);
    expect(only!.renderedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("drops entries whose file is gone from disk", () => {
    const merged = mergeManifest([entry("deleted"), entry("kept")], [], on("kept.mp3"));
    expect(merged.map((e) => e.name)).toEqual(["kept"]);
  });

  it("survives an empty previous manifest and an empty run", () => {
    expect(mergeManifest([], [], on())).toEqual([]);
    expect(mergeManifest([], [entry("a")], on("a.mp3"))).toHaveLength(1);
  });
});

describe("audioName", () => {
  it("names the two flavours a piece renders to", () => {
    expect(audioName("vulture-mile")).toBe("vulture-mile");
    expect(audioName("vulture-mile", { loop: true })).toBe("vulture-mile.loop");
  });
});
