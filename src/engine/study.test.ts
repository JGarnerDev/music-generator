import { describe, expect, it } from "vitest";
import {
  APPROACH_MAX,
  CONCEPTS,
  CONCEPT_GROUPS,
  STUDY_AXES,
  TAG_FACETS,
  VERDICT_TAGS,
  axisOf,
  conceptOf,
  conceptsOfGroup,
  isAxisName,
  isConceptSlug,
  isVerdictTag,
  studyBars,
  tagsOfFacet,
  validateStudy,
  type Study,
} from "./study";
import type { Composition } from "./composition";

const composition: Composition = {
  name: "study-hook-dust-a",
  bpm: 96,
  key: "D minor",
  tracks: [
    {
      instrument: "lead",
      notes: [
        { time: "0:0", pitch: "D4", duration: "4n" },
        { time: "3:2", pitch: "A4", duration: "2n" },
      ],
    },
  ],
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

describe("the concept shelf", () => {
  it("has unique slugs", () => {
    const slugs = CONCEPTS.map((concept) => concept.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("files every concept under a known group", () => {
    for (const concept of CONCEPTS) {
      expect(CONCEPT_GROUPS).toContain(concept.group);
    }
  });

  // A concept whose default axis doesn't exist would fail only at fan-out time,
  // after the user has already picked a mood and waited for a palette match.
  it("names only axes that are on the axis shelf", () => {
    for (const concept of CONCEPTS) {
      expect(concept.axes.length).toBeGreaterThan(0);
      for (const axis of concept.axes) expect(isAxisName(axis)).toBe(true);
    }
  });

  it("puts at least one concept in every group", () => {
    for (const group of CONCEPT_GROUPS) {
      expect(conceptsOfGroup(group).length).toBeGreaterThan(0);
    }
  });

  it("resolves a slug and rejects an unknown one", () => {
    expect(conceptOf("guitar-solo")?.title).toBe("Guitar solo");
    expect(conceptOf("banjo-solo")).toBeUndefined();
    expect(isConceptSlug("hook")).toBe(true);
    expect(isConceptSlug("nope")).toBe(false);
  });
});

describe("the axis shelf", () => {
  it("gives every knob axis values to fan out across, except figure", () => {
    for (const axis of STUDY_AXES) {
      if (axis.kind !== "knob") continue;
      // `figure` draws from the figure shelf at fan-out time rather than
      // duplicating twenty names here.
      if (axis.name === "figure") continue;
      expect(axis.values?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it("gives no values to written axes — there is nothing to enumerate", () => {
    for (const axis of STUDY_AXES) {
      if (axis.kind === "written") expect(axis.values).toBeUndefined();
    }
  });

  it("resolves by name", () => {
    expect(axisOf("register")?.kind).toBe("knob");
    expect(axisOf("phrasing")?.kind).toBe("written");
    expect(axisOf("vibes")).toBeUndefined();
  });
});

describe("the verdict tag shelf", () => {
  it("has unique names filed under known facets", () => {
    const names = VERDICT_TAGS.map((tag) => tag.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tag of VERDICT_TAGS) expect(TAG_FACETS).toContain(tag.facet);
  });

  it("puts at least one tag in every facet, so no facet renders empty", () => {
    for (const facet of TAG_FACETS) expect(tagsOfFacet(facet).length).toBeGreaterThan(0);
  });

  it("recognises shelf tags and nothing else", () => {
    expect(isVerdictTag("cluttered")).toBe(true);
    expect(isVerdictTag("vibes-off")).toBe(false);
  });
});

describe("validateStudy", () => {
  it("accepts a well-formed study", () => {
    expect(validateStudy(study())).toEqual([]);
  });

  it("rejects a concept that is not on the shelf", () => {
    const issues = validateStudy(study({ concept: "banjo-solo" }));
    expect(issues.map((i) => i.path)).toContain("concept");
  });

  it("rejects an axis that is not on the shelf", () => {
    const issues = validateStudy(study({ axis: "vibes" }));
    expect(issues.map((i) => i.path)).toContain("axis");
  });

  it("caps the approach line — it is a ledger table cell", () => {
    const issues = validateStudy(study({ approach: "x".repeat(APPROACH_MAX + 1) }));
    expect(issues.map((i) => i.path)).toContain("approach");
  });

  it("carries composition issues through under a composition. prefix", () => {
    const issues = validateStudy(study({ composition: { ...composition, bpm: 0 } }));
    expect(issues.some((i) => i.path === "composition.bpm")).toBe(true);
  });

  it("accepts a verdict with shelf tags", () => {
    const verdict = { thumb: "up" as const, tags: ["memorable", "breathes"], at: "2026-08-15" };
    expect(validateStudy(study({ verdict }))).toEqual([]);
  });

  // A tag off the shelf is a reason that can never be counted with any other,
  // which is the one thing this whole process exists to prevent.
  it("rejects a verdict tag that is not on the shelf", () => {
    const verdict = { thumb: "up" as const, tags: ["sounds-nice"], at: "2026-08-15" };
    const issues = validateStudy(study({ verdict }));
    expect(issues.map((i) => i.path)).toContain("verdict.tags[0]");
  });

  it("rejects a verdict with no thumb or a malformed date", () => {
    const issues = validateStudy(study({ verdict: { tags: [], at: "yesterday" } as never }));
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["verdict.thumb", "verdict.at"]),
    );
  });

  it("rejects a non-object", () => {
    expect(validateStudy(null)[0]?.path).toBe("$");
  });
});

describe("studyBars", () => {
  it("counts from the last note's bar, inclusive", () => {
    expect(studyBars(composition)).toBe(4);
  });

  it("survives a track whose times are not bar-prefixed numbers", () => {
    const odd: Composition = {
      ...composition,
      tracks: [{ instrument: "lead", notes: [{ time: "oops", pitch: "D4", duration: "4n" }] }],
    };
    expect(studyBars(odd)).toBe(1);
  });
});
