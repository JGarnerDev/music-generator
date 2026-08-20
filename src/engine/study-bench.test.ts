import { describe, it, expect } from "vitest";
import {
  clearedMessage,
  describeStudy,
  emptyStudiesMessage,
  firstSelectable,
  judgeable,
  judgedMessage,
  noStudyAudioMessage,
  openingStudiesMessage,
  rowLabel,
  siblingLabel,
  siblingsOf,
  studyPlayingMessage,
  verdictChip,
  visibleStudies,
  type StudyFilters,
} from "./study-bench";
import type { StudyEntry } from "./study-library";
import type { Study } from "./study";

const entry = (over: Partial<StudyEntry> = {}, study: Partial<Study> = {}): StudyEntry => ({
  id: "guitar-solo/dust-a",
  concept: "guitar-solo",
  slug: "dust-a",
  path: "studies/guitar-solo/dust-a.json",
  issues: [],
  ...over,
  study: {
    concept: "guitar-solo",
    slug: "dust-a",
    title: "Dust, long phrases",
    set: "dust",
    axis: "phrasing",
    variant: "long phrases",
    approach: "Two bars of line, two of rest.",
    ...study,
  } as Study,
});

const filters = (over: Partial<StudyFilters> = {}): StudyFilters => ({
  group: null,
  query: "",
  unjudgedOnly: false,
  selectedId: null,
  ...over,
});

const judged = (over: Partial<StudyEntry>, thumb: "up" | "down" = "up") =>
  entry(over, { verdict: { thumb, tags: [], at: "2026-08-19" } as Study["verdict"] });

describe("visibleStudies", () => {
  const shelf = [
    entry({ id: "guitar-solo/dust-a", slug: "dust-a" }),
    judged({ id: "guitar-solo/dust-b", slug: "dust-b" }),
    entry({ id: "chorus-lift/rise-a", concept: "chorus-lift", slug: "rise-a" }),
  ];

  it("shows everything on the All tab", () => {
    expect(visibleStudies(shelf, filters())).toHaveLength(3);
  });

  it("narrows to one concept group", () => {
    // guitar-solo is a melody concept; chorus-lift is not.
    expect(visibleStudies(shelf, filters({ group: "melody" })).map((e) => e.id)).toEqual([
      "guitar-solo/dust-a",
      "guitar-solo/dust-b",
    ]);
  });

  it("hides judged attempts when the queue filter is on", () => {
    const ids = visibleStudies(shelf, filters({ unjudgedOnly: true })).map((e) => e.id);
    expect(ids).toEqual(["guitar-solo/dust-a", "chorus-lift/rise-a"]);
  });

  it("keeps the selected attempt on screen after it is judged", () => {
    const ids = visibleStudies(
      shelf,
      filters({ unjudgedOnly: true, selectedId: "guitar-solo/dust-b" }),
    ).map((e) => e.id);
    expect(ids).toContain("guitar-solo/dust-b");
  });

  it("searches across set, variant and approach", () => {
    expect(visibleStudies(shelf, filters({ query: "rise" })).map((e) => e.id)).toEqual([
      "chorus-lift/rise-a",
    ]);
  });
});

describe("firstSelectable", () => {
  it("opens on the first row the filters leave", () => {
    const shelf = [judged({ id: "a", slug: "a" }), entry({ id: "b", slug: "b" })];
    expect(firstSelectable(shelf, filters({ unjudgedOnly: true }))?.id).toBe("b");
  });

  it("falls back past the filters rather than opening on nothing", () => {
    const shelf = [judged({ id: "a", slug: "a" }), judged({ id: "b", slug: "b" })];
    expect(firstSelectable(shelf, filters({ unjudgedOnly: true }))?.id).toBe("a");
  });

  it("skips a broken file when falling back, and gives up on an empty shelf", () => {
    const broken = entry({ id: "a", slug: "a", issues: [{ path: "study", message: "is invalid" }] });
    expect(firstSelectable([broken], filters({ query: "nothing" }))).toBeNull();
    expect(firstSelectable([], filters())).toBeNull();
  });
});

describe("emptyStudiesMessage", () => {
  it("blames the search first", () => {
    expect(emptyStudiesMessage(" rise ", true, 4)).toBe("Nothing matches “rise”.");
  });

  it("says the queue is finished, and how to see the judged ones again", () => {
    expect(emptyStudiesMessage("", true, 4)).toContain("Untick “unjudged only”");
  });

  it("tells an empty shelf how to fan out a set", () => {
    expect(emptyStudiesMessage("", true, 0)).toContain("npm run study:new");
    expect(emptyStudiesMessage("", false, 0)).toContain("npm run study:new");
  });
});

describe("rows", () => {
  it("names a row by its set and the tail of its slug", () => {
    expect(rowLabel(entry())).toBe("dust/a");
  });

  it("marks broken and draft files over any verdict they carry", () => {
    expect(verdictChip(entry({ issues: [{ path: "x", message: "bad" }] }))).toEqual({
      variant: "broken",
      text: "broken",
    });
    expect(verdictChip(entry({}, { draft: true }))).toEqual({ variant: "draft", text: "draft" });
  });

  it("shows a neutral pill until there is a verdict", () => {
    expect(verdictChip(entry())).toEqual({ variant: "", text: "—" });
    expect(verdictChip(judged({}))).toEqual({ variant: "up", text: "👍" });
    expect(verdictChip(judged({}, "down"))).toEqual({ variant: "down", text: "👎" });
  });
});

describe("describeStudy", () => {
  it("heads with the title and id, then approach over what is held", () => {
    const described = describeStudy(entry({}, { held: "same backing", mood: "dust road" }));
    expect(described.label).toBe("Dust, long phrases — guitar-solo/dust-a");
    expect(described.approach).toBe(
      "Two bars of line, two of rest.\nheld: same backing · from “dust road” · Guitar solo",
    );
    expect(described.broken).toBe(false);
  });

  it("falls back to an em dash when nothing is held", () => {
    expect(describeStudy(entry()).approach).toContain("held: —");
  });

  it("replaces both lines with the validation issues", () => {
    const described = describeStudy(entry({ issues: [{ path: "axis", message: "is unknown" }] }));
    expect(described.approach).toBe("axis is unknown");
    expect(described.broken).toBe(true);
  });
});

describe("the set strip", () => {
  const a = entry({ id: "guitar-solo/dust-a", slug: "dust-a" });
  const b = judged({ id: "guitar-solo/dust-b", slug: "dust-b" }, "down");
  const other = entry({ id: "guitar-solo/rain-a", slug: "rain-a" }, { set: "rain" });

  it("gathers the siblings that share a set", () => {
    expect(siblingsOf([a, b, other], a).map((e) => e.id)).toEqual([
      "guitar-solo/dust-a",
      "guitar-solo/dust-b",
    ]);
  });

  it("labels a sibling by its position on the axis, with its thumb", () => {
    expect(siblingLabel(a)).toBe("long phrases");
    expect(siblingLabel(b)).toBe("long phrases 👎");
  });
});

describe("judgeable", () => {
  it("lets a valid rendered attempt be played and judged", () => {
    expect(judgeable(entry(), true)).toEqual({ canPlay: true, canJudge: true, canClear: false });
  });

  it("offers Clear only once there is a verdict to take back", () => {
    expect(judgeable(judged({}), true).canClear).toBe(true);
  });

  it("kills play and judging on a draft, which nothing has rendered", () => {
    expect(judgeable(entry({}, { draft: true }), true)).toEqual({
      canPlay: false,
      canJudge: false,
      canClear: false,
    });
  });

  it("kills judging in a built bundle, but still plays", () => {
    expect(judgeable(entry(), false)).toEqual({
      canPlay: true,
      canJudge: false,
      canClear: false,
    });
  });

  it("is all-dead with no selection", () => {
    expect(judgeable(null, true)).toEqual({ canPlay: false, canJudge: false, canClear: false });
  });
});

describe("status messages", () => {
  it("turns a missing render into the command that fixes it", () => {
    expect(noStudyAudioMessage("guitar-solo/dust-a")).toBe(
      "No audio for guitar-solo/dust-a. Run: npm run study:render -- --study guitar-solo/dust-a",
    );
  });

  it("carries the --force re-render", () => {
    const message = studyPlayingMessage("guitar-solo/dust-a", {
      seconds: 8.6,
      renderedOn: "19/08/2026",
    });
    expect(message).toContain("9s, rendered 19/08/2026");
    expect(message).toContain("--study guitar-solo/dust-a --force");
  });

  it("repeats the tags a verdict was given for", () => {
    expect(judgedMessage("guitar-solo/dust-a", "up", ["airy", "patient"], "")).toBe(
      "guitar-solo/dust-a → up (airy, patient). studies/ledger.md rewritten.",
    );
  });

  it("says out loud when a thumb came with no reason at all", () => {
    expect(judgedMessage("guitar-solo/dust-a", "down", [], "  ")).toContain(
      "the tally learns nothing from it",
    );
  });

  it("counts a bare note as a reason", () => {
    expect(judgedMessage("guitar-solo/dust-a", "down", [], "too busy")).toBe(
      "guitar-solo/dust-a → down. studies/ledger.md rewritten.",
    );
  });

  it("puts a cleared verdict back in the queue", () => {
    expect(clearedMessage("guitar-solo/dust-a")).toBe("guitar-solo/dust-a is back in the queue.");
  });

  it("explains dead buttons in a built bundle, and an empty shelf either way", () => {
    expect(openingStudiesMessage(false, true)).toContain("npm run study:new");
    expect(openingStudiesMessage(true, false)).toContain("Read-only build");
    expect(openingStudiesMessage(true, true)).toContain("thumb it");
  });
});
