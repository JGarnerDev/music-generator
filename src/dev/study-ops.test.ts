import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { judge, unjudge } from "./study-ops";
import { deleteStudy, readStudies, studyFile, writeStudy } from "./study-store";
import type { Composition } from "../engine/composition";
import type { Study } from "../engine/study";

const composition: Composition = {
  name: "study-hook-dust-a",
  bpm: 96,
  key: "D minor",
  tracks: [{ instrument: "lead", notes: [{ time: "0:0", pitch: "D4", duration: "4n" }] }],
};

const roots: string[] = [];

/** A studies root with one study in it, thrown away after the test. */
function withStudy(overrides: Partial<Study> = {}): string {
  const root = mkdtempSync(resolve(tmpdir(), "studies-"));
  roots.push(root);
  const study: Study = {
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
  writeStudy(studyFile("hook/dust-a", root), study);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("judge", () => {
  it("writes the verdict onto the file", () => {
    const root = withStudy();
    const result = judge("hook/dust-a", {
      root,
      thumb: "up",
      tags: ["memorable"],
      note: "the shape is the whole thing",
      today: new Date("2026-08-15T10:00:00Z"),
    });
    expect(result.study.verdict).toEqual({
      thumb: "up",
      tags: ["memorable"],
      note: "the shape is the whole thing",
      at: "2026-08-15",
    });
    const onDisk = readStudies(root)[0]!;
    expect(onDisk.study.verdict?.thumb).toBe("up");
    expect(onDisk.issues).toEqual([]);
  });

  it("rewrites the ledger in the same call", () => {
    const root = withStudy();
    judge("hook/dust-a", { root, thumb: "down", tags: ["cluttered"] });
    const ledger = readFileSync(resolve(root, "ledger.md"), "utf8");
    expect(ledger).toContain("`cluttered`");
    expect(ledger).toContain("1 judged · 0 waiting");
  });

  // A silently dropped tag is a reason the listener gave that the ledger will
  // never show — and the ledger is the entire point.
  it("rejects a tag that is not on the shelf rather than dropping it", () => {
    const root = withStudy();
    expect(() => judge("hook/dust-a", { root, thumb: "up", tags: ["sounds-nice"] })).toThrow(
      /not on the tag shelf/,
    );
  });

  it("de-duplicates tags", () => {
    const root = withStudy();
    const result = judge("hook/dust-a", { root, thumb: "up", tags: ["breathes", "breathes"] });
    expect(result.study.verdict?.tags).toEqual(["breathes"]);
  });

  it("drops an empty note rather than storing one", () => {
    const root = withStudy();
    const result = judge("hook/dust-a", { root, thumb: "up", note: "   " });
    expect(result.study.verdict).not.toHaveProperty("note");
  });

  it("replaces an earlier verdict outright — the record is what I think now", () => {
    const root = withStudy({
      verdict: { thumb: "up", tags: ["memorable"], at: "2026-01-01" },
    });
    const result = judge("hook/dust-a", { root, thumb: "down", tags: ["forgettable"] });
    expect(result.study.verdict).toMatchObject({ thumb: "down", tags: ["forgettable"] });
  });

  it("explains an unknown id instead of throwing ENOENT", () => {
    const root = withStudy();
    expect(() => judge("hook/nope", { root, thumb: "up" })).toThrow(/no such study/);
  });

  // The id arrives from an HTTP request as well as a command line, so the guard
  // is what keeps a crafted request inside `studies/`.
  it("refuses an id that is not <concept>/<slug>", () => {
    const root = withStudy();
    expect(() => judge("../../etc/passwd", { root, thumb: "up" })).toThrow(/not a study id/);
    expect(() => judge("banjo-solo/x", { root, thumb: "up" })).toThrow(/unknown concept/);
  });

  it("refuses to judge a file that does not validate", () => {
    const root = withStudy({ axis: "vibes" });
    expect(() => judge("hook/dust-a", { root, thumb: "up" })).toThrow(/not valid yet/);
  });
});

describe("deleteStudy", () => {
  it("removes the file and the concept folder it emptied", () => {
    const root = withStudy();
    deleteStudy("hook/dust-a", root);
    expect(readStudies(root)).toEqual([]);
    expect(existsSync(resolve(root, "hook"))).toBe(false);
  });

  it("keeps the concept folder while a sibling is still in it", () => {
    const root = withStudy();
    writeStudy(studyFile("hook/dust-b", root), {
      concept: "hook",
      slug: "dust-b",
      title: "Hook cell — low",
      set: "dust",
      axis: "register",
      variant: "low",
      approach: "register = low; everything else held.",
      composition,
    });
    deleteStudy("hook/dust-a", root);
    expect(readStudies(root).map((e) => e.id)).toEqual(["hook/dust-b"]);
  });

  // Same strict `<concept>/<slug>` guard that protects a write.
  it("refuses an id that could escape studies/", () => {
    const root = withStudy();
    expect(() => deleteStudy("../../package", root)).toThrow(/not a study id/);
    expect(readStudies(root)).toHaveLength(1);
  });

  it("is a no-op on a study that is already gone", () => {
    const root = withStudy();
    deleteStudy("hook/dust-a", root);
    expect(() => deleteStudy("hook/dust-a", root)).not.toThrow();
  });
});

describe("unjudge", () => {
  it("removes the verdict and puts the study back in the queue", () => {
    const root = withStudy({ verdict: { thumb: "up", tags: [], at: "2026-08-15" } });
    const result = unjudge("hook/dust-a", { root });
    expect(result.study).not.toHaveProperty("verdict");
    expect(readStudies(root)[0]!.study.verdict).toBeUndefined();
    expect(readFileSync(resolve(root, "ledger.md"), "utf8")).toContain("0 judged · 1 waiting");
  });
});
