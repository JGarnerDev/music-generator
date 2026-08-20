import { describe, it, expect } from "vitest";
import {
  buildLibrary,
  chipLabels,
  countsByKind,
  danglingMotifs,
  emptyMessage,
  entriesOfKind,
  inferKind,
  kindFromPath,
  motifUsage,
  neighboursOf,
  searchEntries,
  tagsOf,
  type LibraryEntry,
} from "./library";
import type { Composition } from "./composition";

const comp = (over: Partial<Composition> = {}): Composition => ({
  name: "piece",
  bpm: 90,
  key: "A minor",
  tracks: [{ instrument: "piano", notes: [{ time: "0:0", pitch: "A3", duration: "4n" }] }],
  ...over,
});

describe("kindFromPath", () => {
  it("reads the folder under compositions/", () => {
    expect(kindFromPath("compositions/loops/foo.json")).toBe("loops");
    expect(kindFromPath("../../compositions/leitmotifs/ashen-king.json")).toBe("leitmotifs");
    expect(kindFromPath("C:\\repo\\compositions\\songs\\epic.json")).toBe("songs");
  });

  it("returns null for a loose file or an unknown folder", () => {
    expect(kindFromPath("compositions/foo.json")).toBeNull();
    expect(kindFromPath("compositions/sketches/foo.json")).toBeNull();
  });
});

describe("inferKind", () => {
  it("files a piece with a loop window as a loop, everything else as a segment", () => {
    expect(inferKind(comp({ loop: { startBar: 0, endBar: 8 } }))).toBe("loops");
    expect(inferKind(comp())).toBe("segments");
  });
});

describe("tagsOf", () => {
  it("prefers explicit tags, falls back to palette provenance", () => {
    expect(tagsOf(comp({ tags: ["camp"], palettes: ["calm"] }))).toEqual(["camp"]);
    expect(tagsOf(comp({ palettes: ["calm", "lofi"] }))).toEqual(["calm", "lofi"]);
    expect(tagsOf(comp())).toEqual([]);
  });
});

describe("buildLibrary", () => {
  const entries = buildLibrary({
    "compositions/segments/dog-dies.json": comp({ name: "dog-dies", palettes: ["sad"] }),
    "compositions/leitmotifs/ashen-king.json": comp({ name: "ashen-king", tags: ["villain"] }),
    "compositions/loops/camp.json": comp({ name: "camp", loop: { startBar: 0, endBar: 8 } }),
    "compositions/stray.json": comp({ name: "stray", loop: { startBar: 0, endBar: 4 } }),
  });

  it("ids entries by kind/slug and sorts by kind order then slug", () => {
    expect(entries.map((e) => e.id)).toEqual([
      "leitmotifs/ashen-king",
      "segments/dog-dies",
      "loops/camp",
      "loops/stray",
    ]);
  });

  // The path is printed as `npm run render -- --file <path>` and posted to the
  // delete endpoint, so it has to be what you would type at the repo root — not
  // however far up the page that globbed it happens to sit.
  it("normalises Vite's module-relative glob keys to repo-relative paths", () => {
    const fromPages = buildLibrary({
      "../../../compositions/loops/camp.json": comp({ name: "camp" }),
    });
    expect(fromPages[0]?.path).toBe("compositions/loops/camp.json");
    expect(fromPages[0]?.id).toBe("loops/camp");
  });

  it("leaves a path that is already repo-relative alone", () => {
    expect(entries.map((e) => e.path)).toContain("compositions/loops/camp.json");
  });

  it("leaves trashed files out of the library", () => {
    const withTrash = buildLibrary({
      "compositions/segments/kept.json": comp({ name: "kept" }),
      "compositions/_trash/segments/gone.json": comp({ name: "gone" }),
    });
    expect(withTrash.map((e) => e.slug)).toEqual(["kept"]);
  });

  it("keeps loose root files by inferring their kind", () => {
    const stray = entries.find((e) => e.slug === "stray")!;
    expect(stray.kind).toBe("loops");
    expect(stray.path).toBe("compositions/stray.json");
  });

  it("carries display tags across", () => {
    expect(entries.find((e) => e.slug === "dog-dies")!.tags).toEqual(["sad"]);
    expect(entries.find((e) => e.slug === "ashen-king")!.tags).toEqual(["villain"]);
  });

  it("filters and counts by kind", () => {
    expect(entriesOfKind(entries, "loops").map((e) => e.slug)).toEqual(["camp", "stray"]);
    expect(entriesOfKind(entries, null)).toHaveLength(4);
    expect(countsByKind(entries)).toEqual({ leitmotifs: 1, segments: 1, loops: 2, songs: 0 });
  });
});

describe("searchEntries", () => {
  const entries = buildLibrary({
    "compositions/segments/dog-dies.json": comp({ name: "dog-dies", palettes: ["sad"] }),
    "compositions/loops/camp.json": comp({ name: "camp", tags: ["night"] }),
  });

  it("matches slug and tags case-insensitively", () => {
    expect(searchEntries(entries, "DOG").map((e) => e.slug)).toEqual(["dog-dies"]);
    expect(searchEntries(entries, "night").map((e) => e.slug)).toEqual(["camp"]);
    expect(searchEntries(entries, "  ")).toHaveLength(2);
  });
});

describe("motifUsage", () => {
  const entries = buildLibrary({
    "compositions/leitmotifs/ashen-king.json": comp({ name: "ashen-king" }),
    "compositions/leitmotifs/unused.json": comp({ name: "unused" }),
    "compositions/loops/throne.json": comp({ name: "throne", motifs: ["ashen-king"] }),
    "compositions/songs/finale.json": comp({ name: "finale", motifs: ["ashen-king", "ghost"] }),
  });

  it("maps each leitmotif to the pieces quoting it", () => {
    const usage = motifUsage(entries);
    expect(usage.get("ashen-king")!.map((e) => e.slug)).toEqual(["throne", "finale"]);
    expect(usage.get("unused")).toEqual([]);
  });

  it("reports quotes that name no known leitmotif", () => {
    expect(danglingMotifs(entries)).toEqual([
      { entry: expect.objectContaining({ slug: "finale" }), motif: "ghost" },
    ]);
  });
});

describe("neighboursOf", () => {
  const shelf = buildLibrary({
    "compositions/loops/warpath.json": comp({ key: "D minor", bpm: 152 }),
    "compositions/loops/shredout.json": comp({ key: "D minor", bpm: 146 }),
    "compositions/segments/lament.json": comp({ key: "F major", bpm: 68 }),
    "compositions/segments/waltz.json": comp({ key: "D minor", bpm: 150, meter: [3, 4] }),
  });

  it("finds the piece already written in this key and tempo band", () => {
    const found = neighboursOf({ key: "D minor", bpm: 158 }, shelf);
    expect(found.map((n) => n.entry.slug)).toContain("warpath");
  });

  it("ignores a piece in another key, however close the tempo", () => {
    expect(neighboursOf({ key: "F major", bpm: 152 }, shelf).map((n) => n.entry.slug)).toEqual([]);
  });

  it("ignores the same key at a genuinely different tempo", () => {
    expect(neighboursOf({ key: "D minor", bpm: 90 }, shelf)).toEqual([]);
  });

  it("still reports a piece in another meter, but ranks the exact match first", () => {
    // A waltz in the same key at the same tempo is a weaker collision than a
    // 4/4 piece is, so it sorts below — but it is worth knowing about.
    const found = neighboursOf({ key: "D minor", bpm: 151 }, shelf);
    expect(found[0]!.shared).toContain("meter");
    expect(found.map((n) => n.entry.slug)).toContain("waltz");
  });

  it("says which fields matched, so there is something to change", () => {
    const [first] = neighboursOf({ key: "D minor", bpm: 152 }, shelf);
    expect(first!.shared).toEqual(["key", "tempo", "meter"]);
  });
});

describe("chipLabels", () => {
  const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
    id: "segments/piece",
    kind: "segments",
    slug: "piece",
    path: "compositions/segments/piece.json",
    composition: comp(),
    tags: [],
    motifs: [],
    ...over,
  });

  it("lists tags first, then quoted motifs", () => {
    expect(chipLabels(entry({ tags: ["dusty", "tense"], motifs: ["lioness"] }), 0)).toEqual([
      { text: "dusty", motif: false },
      { text: "tense", motif: false },
      { text: "♪ lioness", motif: true },
    ]);
  });

  it("counts quoters, but only for a leitmotif", () => {
    expect(chipLabels(entry({ kind: "leitmotifs" }), 3)).toEqual([
      { text: "♪ quoted ×3", motif: true },
    ]);
    expect(chipLabels(entry({ kind: "segments" }), 3)).toEqual([]);
    expect(chipLabels(entry({ kind: "leitmotifs" }), 0)).toEqual([]);
  });
});

describe("emptyMessage", () => {
  it("blames the filter when there is one", () => {
    expect(emptyMessage("loops", "  sitar ")).toBe("Nothing matches “sitar”.");
  });

  it("names the folder, or the whole library on the All tab", () => {
    expect(emptyMessage("loops", "")).toBe("Nothing in compositions/loops/ yet.");
    expect(emptyMessage(null, "")).toBe("No compositions yet — run npm run compose.");
  });
});
