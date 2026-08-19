import { describe, it, expect } from "vitest";
import {
  addCue,
  campaignsOf,
  cueLoops,
  emptySession,
  entriesOfCampaign,
  moveCue,
  parseSessions,
  removeCue,
  renderSessionPlan,
  resolveCues,
  sessionSlug,
  setCueLoop,
  setCueNote,
  unplayableCues,
  validateSessionPlan,
  type ResolvedCue,
  type SessionPlan,
} from "./session";
import { buildLibrary } from "./library";
import type { Composition } from "./composition";
import type { ManifestEntry } from "./manifest";

const comp = (over: Partial<Composition> = {}): Composition => ({
  name: "piece",
  bpm: 90,
  key: "A minor",
  tracks: [{ instrument: "piano", notes: [{ time: "0:0", pitch: "A3", duration: "4n" }] }],
  ...over,
});

const library = buildLibrary({
  "compositions/loops/tavern.json": comp({ name: "tavern", campaign: "redwater", loop: { startBar: 0, endBar: 8 } }),
  "compositions/segments/ambush.json": comp({ name: "ambush", campaign: "redwater" }),
  "compositions/segments/unrendered.json": comp({ name: "unrendered", campaign: "redwater" }),
  "compositions/segments/stray.json": comp({ name: "stray" }),
  "compositions/leitmotifs/king.json": comp({ name: "king", campaign: "ashen" }),
});

const audio = (name: string, isLoop = false): ManifestEntry => ({
  name,
  file: `${name}.mp3`,
  seconds: 12,
  bytes: 99999,
  isLoop,
  renderedAt: "2026-08-01T00:00:00.000Z",
});

const rendered = new Map<string, ManifestEntry>([
  ["tavern.loop", audio("tavern.loop", true)],
  ["ambush", audio("ambush")],
]);

const plan = (cues: SessionPlan["cues"]): SessionPlan => ({ name: "night", campaign: "redwater", cues });

describe("sessionSlug", () => {
  it("squeezes a typed name down to a filename", () => {
    expect(sessionSlug("Session 14 — The Ambush!")).toBe("session-14-the-ambush");
    expect(sessionSlug("  ...  ")).toBe("");
  });
});

describe("validateSessionPlan", () => {
  it("accepts a minimal plan", () => {
    expect(validateSessionPlan({ name: "night", cues: [] })).toEqual([]);
  });

  it("rejects a plan whose name cannot become a filename", () => {
    expect(validateSessionPlan({ name: "!!!", cues: [] })).toEqual([
      { path: "name", message: "must be a non-empty slug" },
    ]);
  });

  it("reports the cue that is wrong, by index", () => {
    const issues = validateSessionPlan({ name: "night", cues: [{ entry: "loops/tavern" }, { loop: "yes" }] });
    expect(issues.map((i) => i.path)).toEqual(["cues[1].entry", "cues[1].loop"]);
  });

  it("accepts a cue naming a piece that does not exist yet", () => {
    // Plans get written before the music does; that is a missing cue, not a bad plan.
    expect(validateSessionPlan({ name: "night", cues: [{ entry: "loops/not-written" }] })).toEqual([]);
  });
});

describe("parseSessions", () => {
  it("keeps the valid plans, sorted, and drops the rest", () => {
    const plans = parseSessions([
      { name: "two", cues: [] },
      { name: "one", cues: [] },
      { name: "bad", cues: "nope" },
      null,
    ]);
    expect(plans.map((p) => p.name)).toEqual(["one", "two"]);
  });

  it("treats a missing file as no sessions rather than throwing", () => {
    expect(parseSessions(null)).toEqual([]);
  });
});

describe("editing", () => {
  it("appends cues, allowing a theme to recur in one night", () => {
    const p = addCue(addCue(emptySession("Night One"), "loops/tavern"), "loops/tavern", "again, quieter");
    expect(p.cues).toEqual([{ entry: "loops/tavern" }, { entry: "loops/tavern", note: "again, quieter" }]);
  });

  it("removes by index and leaves the rest in order", () => {
    const p = removeCue(plan([{ entry: "a" }, { entry: "b" }, { entry: "c" }]), 1);
    expect(p.cues.map((c) => c.entry)).toEqual(["a", "c"]);
  });

  it("clamps a move at the ends instead of wrapping", () => {
    const start = plan([{ entry: "a" }, { entry: "b" }, { entry: "c" }]);
    expect(moveCue(start, 0, -1)).toBe(start);
    expect(moveCue(start, 2, 1)).toBe(start);
    expect(moveCue(start, 2, -1).cues.map((c) => c.entry)).toEqual(["a", "c", "b"]);
  });

  it("never mutates the plan it was given", () => {
    const start = plan([{ entry: "a" }]);
    addCue(start, "b");
    removeCue(start, 0);
    expect(start.cues).toEqual([{ entry: "a" }]);
  });

  it("clears a note when set to blank rather than storing an empty string", () => {
    const noted = setCueNote(plan([{ entry: "a" }]), 0, "  when the door opens ");
    expect(noted.cues[0]).toEqual({ entry: "a", note: "when the door opens" });
    expect(setCueNote(noted, 0, "   ").cues[0]).toEqual({ entry: "a" });
  });

  it("drops a loop override set back to undefined", () => {
    const forced = setCueLoop(plan([{ entry: "a" }]), 0, false);
    expect(forced.cues[0]).toEqual({ entry: "a", loop: false });
    expect(setCueLoop(forced, 0, undefined).cues[0]).toEqual({ entry: "a" });
  });

  it("ignores an out-of-range index", () => {
    const start = plan([{ entry: "a" }]);
    expect(removeCue(start, 4)).toBe(start);
    expect(setCueNote(start, -1, "x")).toBe(start);
  });
});

describe("cueLoops", () => {
  const loopEntry = library.find((e) => e.slug === "tavern")!;
  const oneShot = library.find((e) => e.slug === "ambush")!;

  it("defaults to what the piece was written as", () => {
    expect(cueLoops({ entry: "x" }, loopEntry)).toBe(true);
    expect(cueLoops({ entry: "x" }, oneShot)).toBe(false);
  });

  it("honours an override, except that a piece with no loop window cannot loop", () => {
    expect(cueLoops({ entry: "x", loop: false }, loopEntry)).toBe(false);
    expect(cueLoops({ entry: "x", loop: true }, oneShot)).toBe(false);
  });
});

describe("resolveCues", () => {
  const resolved: ResolvedCue[] = resolveCues(
    plan([
      { entry: "loops/tavern" },
      { entry: "segments/ambush", note: "door opens" },
      { entry: "segments/unrendered" },
      { entry: "segments/deleted" },
    ]),
    library,
    rendered,
  );

  it("picks the seam-wrapped loop body for a looping cue", () => {
    expect(resolved[0]!.loop).toBe(true);
    expect(resolved[0]!.audio?.file).toBe("tavern.loop.mp3");
    expect(resolved[0]!.status).toBe("ready");
  });

  it("picks the full take for a one-shot", () => {
    expect(resolved[1]!.audio?.file).toBe("ambush.mp3");
    expect(resolved[1]!.status).toBe("ready");
  });

  it("flags a piece nobody rendered, with the command that fixes it", () => {
    expect(resolved[2]!.status).toBe("missing-audio");
    expect(resolved[2]!.hint).toContain("npm run render");
    expect(resolved[2]!.hint).toContain("compositions/segments/unrendered.json");
  });

  it("flags a cue whose piece is gone, and still labels the row", () => {
    expect(resolved[3]!.status).toBe("missing-piece");
    expect(resolved[3]!.entry).toBeNull();
    expect(resolved[3]!.label).toBe("segments/deleted");
  });

  it("collects everything that cannot sound for the pre-flight check", () => {
    expect(unplayableCues(resolved).map((c) => c.index)).toEqual([2, 3]);
  });
});

describe("campaigns", () => {
  it("lists the campaigns on the shelf, sorted", () => {
    expect(campaignsOf(library)).toEqual(["ashen", "redwater"]);
  });

  it("filters to one campaign, and null means everything", () => {
    expect(entriesOfCampaign(library, "ashen").map((e) => e.slug)).toEqual(["king"]);
    expect(entriesOfCampaign(library, null)).toHaveLength(library.length);
  });

  it("leaves an unfiled piece out of every campaign", () => {
    expect(entriesOfCampaign(library, "redwater").map((e) => e.slug)).not.toContain("stray");
  });
});

describe("renderSessionPlan", () => {
  it("writes a stable, minimal file", () => {
    const json = renderSessionPlan({
      name: "night",
      title: "Session 14",
      campaign: "redwater",
      cues: [{ entry: "loops/tavern", note: "arrival" }, { entry: "segments/ambush", loop: false }],
    });
    expect(json).toBe(
      `{
  "name": "night",
  "title": "Session 14",
  "campaign": "redwater",
  "cues": [
    {
      "entry": "loops/tavern",
      "note": "arrival"
    },
    {
      "entry": "segments/ambush",
      "loop": false
    }
  ]
}
`,
    );
  });

  it("omits absent optional fields instead of writing nulls", () => {
    expect(renderSessionPlan(emptySession("Night One"))).toBe('{\n  "name": "night-one",\n  "cues": []\n}\n');
  });
});
