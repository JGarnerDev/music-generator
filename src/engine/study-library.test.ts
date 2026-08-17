import { describe, expect, it } from "vitest";
import {
  buildStudyLibrary,
  conceptFromPath,
  countsByGroup,
  planCleanup,
  renderStudyLedger,
  searchStudies,
  setsOf,
  studiesOfGroup,
  studyAudioName,
  tallyAxis,
  tallyConcepts,
  tallyTags,
  unjudged,
  type StudyEntry,
} from "./study-library";
import type { Composition } from "./composition";
import type { Study, Thumb } from "./study";

const composition: Composition = {
  name: "study",
  bpm: 96,
  key: "D minor",
  tracks: [{ instrument: "lead", notes: [{ time: "0:0", pitch: "D4", duration: "4n" }] }],
};

function study(overrides: Partial<Study> = {}): Study {
  return {
    concept: "hook",
    slug: "dust-a",
    title: "Hook cell — high",
    set: "dust",
    axis: "register",
    variant: "high",
    approach: "register = high; everything else held.",
    composition,
    ...overrides,
  };
}

function verdict(thumb: Thumb, tags: string[] = [], note?: string) {
  return { thumb, tags, at: "2026-08-15", ...(note ? { note } : {}) };
}

describe("conceptFromPath", () => {
  it("reads the folder under studies/", () => {
    expect(conceptFromPath("studies/hook/dust-a.json")).toBe("hook");
  });

  it("handles Vite's relative glob keys and Windows separators", () => {
    expect(conceptFromPath("../../studies/guitar-solo/x.json")).toBe("guitar-solo");
    expect(conceptFromPath("studies\\loop-seam\\x.json")).toBe("loop-seam");
  });

  it("returns null for a folder that is not a known concept", () => {
    expect(conceptFromPath("studies/banjo-solo/x.json")).toBeNull();
  });
});

describe("buildStudyLibrary", () => {
  it("files entries by folder and keys them <concept>/<slug>", () => {
    const entries = buildStudyLibrary({ "studies/hook/dust-a.json": study() });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe("hook/dust-a");
    expect(entries[0]!.issues).toEqual([]);
  });

  // The filesystem is the taxonomy: a stale field must not be able to move a
  // study out from under the verdicts already recorded against it.
  it("lets the folder and filename win over the file's own fields", () => {
    const entries = buildStudyLibrary({
      "studies/hook/dust-a.json": study({ concept: "guitar-solo", slug: "elsewhere" }),
    });
    expect(entries[0]!.study.concept).toBe("hook");
    expect(entries[0]!.study.slug).toBe("dust-a");
  });

  it("drops files in unknown folders but keeps invalid ones, flagged", () => {
    const entries = buildStudyLibrary({
      "studies/banjo-solo/x.json": study(),
      "studies/hook/broken.json": { nope: true },
    });
    expect(entries.map((e) => e.id)).toEqual(["hook/broken"]);
    expect(entries[0]!.issues.length).toBeGreaterThan(0);
  });

  it("sorts by group, then concept, then set, then slug", () => {
    const entries = buildStudyLibrary({
      // `groove-feel` is a rhythm concept; `hook` is melody, which sorts first.
      "studies/groove-feel/z-a.json": study({ concept: "groove-feel", set: "z" }),
      "studies/hook/b-a.json": study({ set: "b" }),
      "studies/hook/a-a.json": study({ set: "a" }),
    });
    expect(entries.map((e) => e.id)).toEqual(["hook/a-a", "hook/b-a", "groove-feel/z-a"]);
  });
});

describe("grouping and filtering", () => {
  const entries = buildStudyLibrary({
    "studies/hook/a-a.json": study({ set: "a", verdict: verdict("up") }),
    "studies/hook/a-b.json": study({ set: "a", variant: "low" }),
    "studies/groove-feel/g-a.json": study({ concept: "groove-feel", set: "g", variant: "gallop" }),
  });

  it("filters by concept group and counts the tabs", () => {
    expect(studiesOfGroup(entries, "melody").map((e) => e.id)).toEqual(["hook/a-a", "hook/a-b"]);
    expect(studiesOfGroup(entries, null)).toHaveLength(3);
    const counts = countsByGroup(entries);
    expect(counts.melody).toBe(2);
    expect(counts.rhythm).toBe(1);
    expect(counts.harmony).toBe(0);
  });

  it("searches slug, concept, set and variant", () => {
    expect(searchStudies(entries, "gallop").map((e) => e.id)).toEqual(["groove-feel/g-a"]);
    expect(searchStudies(entries, "")).toHaveLength(3);
  });

  it("lists what is still waiting on a thumb", () => {
    expect(unjudged(entries).map((e) => e.id)).toEqual(["hook/a-b", "groove-feel/g-a"]);
  });

  // The set is the unit of comparison, so it has to survive being keyed across
  // two concepts that happened to pick the same set name.
  it("groups attempts into sets, keyed by concept as well as set name", () => {
    const shared = buildStudyLibrary({
      "studies/hook/a-a.json": study({ set: "a" }),
      "studies/groove-feel/a-a.json": study({ concept: "groove-feel", set: "a" }),
    });
    const sets = setsOf(shared);
    expect([...sets.keys()].sort()).toEqual(["groove-feel/a", "hook/a"]);
    expect(sets.get("hook/a")).toHaveLength(1);
  });
});

describe("tallies", () => {
  const entries = buildStudyLibrary({
    "studies/hook/a-a.json": study({ set: "a", verdict: verdict("up", ["memorable", "breathes"]) }),
    "studies/hook/a-b.json": study({
      set: "a",
      variant: "low",
      verdict: verdict("down", ["cluttered", "breathes"]),
    }),
    "studies/hook/a-c.json": study({ set: "a", variant: "mid" }),
    "studies/hook/a-d.json": study({ set: "a", variant: "low", verdict: verdict("down", ["cluttered"]) }),
  });

  // Both counts are kept rather than netted: a tag split evenly is a tag being
  // used for two different things, which is a shelf problem, not a preference.
  it("counts each tag on both sides of the thumb", () => {
    const tally = tallyTags(entries);
    expect(tally.find((t) => t.tag === "breathes")).toEqual({ tag: "breathes", up: 1, down: 1 });
    expect(tally.find((t) => t.tag === "cluttered")).toEqual({ tag: "cluttered", up: 0, down: 2 });
    expect(tally.find((t) => t.tag === "memorable")).toEqual({ tag: "memorable", up: 1, down: 0 });
  });

  it("sorts tags by total mentions, most first", () => {
    expect(tallyTags(entries).map((t) => t.tag).slice(0, 2)).toEqual(["breathes", "cluttered"]);
  });

  it("ignores unjudged studies", () => {
    const none = buildStudyLibrary({ "studies/hook/a-c.json": study() });
    expect(tallyTags(none)).toEqual([]);
  });

  it("reports per-concept counts only for concepts with a verdict", () => {
    const tallies = tallyConcepts(entries);
    expect(tallies).toHaveLength(1);
    expect(tallies[0]!.concept.slug).toBe("hook");
    expect(tallies[0]!).toMatchObject({ judged: 3, up: 1, down: 2 });
  });

  // The whole point of the one-axis rule: two thumbs-down on `register = low`
  // is a statement about register, which only holds because nothing else moved.
  it("collapses repeated axis values into one row", () => {
    const rows = tallyAxis(entries, "hook");
    expect(rows).toEqual([
      { axis: "register", variant: "high", up: 1, down: 0 },
      { axis: "register", variant: "low", up: 0, down: 2 },
    ]);
  });
});

describe("renderStudyLedger", () => {
  it("says so plainly when nothing has been judged", () => {
    const md = renderStudyLedger(buildStudyLibrary({ "studies/hook/a-a.json": study() }), {
      updated: "2026-08-15",
    });
    expect(md).toContain("Nothing judged yet");
    expect(md).toContain("0 judged · 1 waiting");
  });

  it("writes frontmatter, the signals table and one row per verdict", () => {
    const entries = buildStudyLibrary({
      "studies/hook/a-a.json": study({ verdict: verdict("up", ["memorable"], "the rest is filler") }),
      "studies/hook/a-b.json": study({ set: "a", variant: "low" }),
    });
    const md = renderStudyLedger(entries, { updated: "2026-08-15" });
    expect(md.startsWith("---\ntitle: Study verdicts")).toBe(true);
    expect(md).toContain("generated_by: npm run study:ledger");
    expect(md).toContain("## Signals");
    expect(md).toContain("`memorable`");
    expect(md).toContain("the rest is filler");
    expect(md).toContain("## Waiting on a thumb");
    expect(md).toContain("`hook/a-b`");
  });

  it("escapes pipes so prose cannot end a table column", () => {
    const entries = buildStudyLibrary({
      "studies/hook/a-a.json": study({ verdict: verdict("down", [], "a | b") }),
    });
    expect(renderStudyLedger(entries, { updated: "2026-08-15" })).toContain("a \\| b");
  });

  it("marks a scaffolded attempt as still needing writing", () => {
    const entries = buildStudyLibrary({
      "studies/hook/a-a.json": study({ verdict: verdict("up") }),
      "studies/hook/a-b.json": study({ set: "a", draft: true }),
    });
    expect(renderStudyLedger(entries, { updated: "2026-08-15" })).toContain("*(needs writing)*");
  });

  it("leaves broken files out of the counts entirely", () => {
    const entries: StudyEntry[] = buildStudyLibrary({
      "studies/hook/a-a.json": study({ verdict: verdict("up") }),
      "studies/hook/broken.json": { nope: true },
    });
    expect(renderStudyLedger(entries, { updated: "2026-08-15" })).toContain("1 judged · 0 waiting · 1 total");
  });
});

describe("planCleanup", () => {
  const entries = buildStudyLibrary({
    "studies/hook/a-a.json": study({ set: "a", verdict: verdict("up", ["memorable"]) }),
    "studies/hook/a-b.json": study({ set: "a", variant: "low" }),
    "studies/hook/broken.json": { nope: true },
  });

  it("removes judged studies and names the audio that goes with them", () => {
    const plan = planCleanup(entries);
    // Library order, so the broken file — which has no `set` to sort by — leads.
    expect(plan.remove.map((r) => r.entry.id)).toEqual(["hook/broken", "hook/a-a"]);
    expect(plan.remove.map((r) => r.audioName)).toEqual(["hook.broken", "hook.a-a"]);
  });

  // Deleting an attempt nobody thumbed throws away the render *and* the
  // question, and neither is recorded anywhere else once the files are gone.
  it("holds back unjudged studies by default", () => {
    expect(planCleanup(entries).unjudged.map((e) => e.id)).toEqual(["hook/a-b"]);
  });

  it("takes the unjudged too when asked", () => {
    const plan = planCleanup(entries, { includeUnjudged: true });
    expect(plan.remove).toHaveLength(3);
    expect(plan.unjudged).toEqual([]);
  });

  // A broken file is a typo, not a question worth protecting.
  it("treats a broken file as removable without a verdict", () => {
    const broken = buildStudyLibrary({ "studies/hook/broken.json": { nope: true } });
    expect(planCleanup(broken).remove.map((r) => r.entry.id)).toEqual(["hook/broken"]);
  });

  it("plans nothing from an empty selection", () => {
    expect(planCleanup([])).toEqual({ remove: [], unjudged: [] });
  });
});

describe("studyAudioName", () => {
  it("is <concept>.<slug>, matching the manifest key", () => {
    expect(studyAudioName("hook", "dust-a")).toBe("hook.dust-a");
  });
});
