import { describe, it, expect } from "vitest";
import {
  addedMessage,
  archiveChips,
  archiveEmptyMessage,
  checkSessionName,
  cueEmptyMessage,
  hotkeyLabel,
  muteMessage,
  noEntryAudioMessage,
  noteLabel,
  nowPlayingLabel,
  parseStoredVolume,
  planHeader,
  readinessMessage,
  saveFailedMessage,
  savedMessage,
  volumeRead,
} from "./session-bench";
import { resolveCues, type SessionPlan } from "./session";
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
  "compositions/loops/tavern.json": comp({
    name: "tavern",
    campaign: "redwater",
    tags: ["redwater", "warm"],
    loop: { startBar: 0, endBar: 8 },
  }),
  "compositions/segments/ambush.json": comp({ name: "ambush", campaign: "redwater" }),
  "compositions/segments/unrendered.json": comp({ name: "unrendered", campaign: "redwater" }),
  "compositions/segments/stray.json": comp({ name: "stray", tags: ["quiet"] }),
});

const audio = (name: string, seconds: number, isLoop = false): ManifestEntry => ({
  name,
  file: `${name}.mp3`,
  seconds,
  bytes: 99999,
  isLoop,
  renderedAt: "2026-08-01T00:00:00.000Z",
});

const rendered = new Map<string, ManifestEntry>([
  ["tavern.loop", audio("tavern.loop", 40, true)],
  ["ambush", audio("ambush", 35)],
]);

const plan = (cues: SessionPlan["cues"], over: Partial<SessionPlan> = {}): SessionPlan => ({
  name: "night",
  campaign: "redwater",
  cues,
  ...over,
});

const resolve = (p: SessionPlan) => resolveCues(p, library, rendered);

const entry = (id: string) => library.find((e) => e.id === id)!;

describe("planHeader", () => {
  it("counts the cues, the runtime and how much of it can sound", () => {
    const p = plan([{ entry: "loops/tavern" }, { entry: "segments/ambush" }]);
    expect(planHeader(p, resolve(p))).toEqual({
      title: "night",
      meta: "redwater campaign · 2 cues · 1:15 of audio · all playable",
      warn: false,
    });
  });

  it("warns, and says how many, when a cue cannot play", () => {
    const p = plan([{ entry: "segments/unrendered" }, { entry: "segments/ambush" }]);
    const header = planHeader(p, resolve(p));
    expect(header.meta).toBe("redwater campaign · 2 cues · 0:35 of audio · ⚠ 1 cannot play");
    expect(header.warn).toBe(true);
  });

  it("prefers the title, and singularises one cue", () => {
    const p = plan([{ entry: "segments/ambush" }], { title: "Session 14 — Redwater" });
    expect(planHeader(p, resolve(p)).meta).toContain("1 cue ·");
    expect(planHeader(p, resolve(p)).title).toBe("Session 14 — Redwater");
  });

  it("offers the command that makes a session when there is none", () => {
    expect(planHeader(null, [])).toEqual({
      title: "No session yet",
      meta: 'New session, or: npm run session:new -- --name "Session 14"',
      warn: false,
    });
  });

  it("says which campaign, or that there is none", () => {
    const p = plan([], { campaign: undefined });
    expect(planHeader(p, []).meta).toContain("no campaign");
  });
});

describe("hotkeyLabel", () => {
  it("numbers the first nine cues and dots the rest", () => {
    expect(hotkeyLabel(0)).toBe("1");
    expect(hotkeyLabel(8)).toBe("9");
    expect(hotkeyLabel(9)).toBe("·");
  });
});

describe("noteLabel", () => {
  const [ready, broken] = resolve(
    plan([{ entry: "segments/ambush" }, { entry: "segments/unrendered" }]),
  );

  it("shows the note when there is one", () => {
    const [cue] = resolve(plan([{ entry: "segments/ambush", note: "when the door opens" }]));
    expect(noteLabel(cue!)).toEqual({ text: "when the door opens", empty: false });
  });

  it("invites one when there is not", () => {
    expect(noteLabel(ready!)).toEqual({ text: "＋ add a note", empty: true });
  });

  it("spends the space on the fix when the cue cannot play", () => {
    expect(noteLabel(broken!)).toEqual({
      text: "Not rendered: npm run render -- --file compositions/segments/unrendered.json",
      empty: true,
    });
  });
});

describe("cueEmptyMessage", () => {
  it("points at the archive tab when there is a plan to fill", () => {
    expect(cueEmptyMessage(true)).toContain("Archive tab");
    expect(cueEmptyMessage(false)).toBe("No session loaded.");
  });
});

describe("archiveChips", () => {
  it("leads with the campaign and drops a tag repeating it", () => {
    expect(archiveChips(entry("loops/tavern"))).toEqual([
      { text: "redwater", campaign: true },
      { text: "warm", campaign: false },
    ]);
  });

  it("leaves a piece filed under no campaign with only its tags", () => {
    expect(archiveChips(entry("segments/stray"))).toEqual([{ text: "quiet", campaign: false }]);
  });
});

describe("archiveEmptyMessage", () => {
  it("blames the search first", () => {
    expect(archiveEmptyMessage("redwater", "  banjo ")).toBe("Nothing matches “banjo”.");
  });

  it("blames the empty shelf when nothing is filtered", () => {
    expect(archiveEmptyMessage(null, "")).toBe("No compositions yet — run npm run compose.");
  });

  it("says how to file a piece under the campaign being looked at", () => {
    expect(archiveEmptyMessage("ashen", "")).toBe(
      'Nothing filed under “ashen” — add "campaign": "ashen" to a piece.',
    );
  });
});

describe("readinessMessage", () => {
  it("names the session when every cue is ready", () => {
    const p = plan([{ entry: "loops/tavern" }]);
    expect(readinessMessage(p, resolve(p))).toBe("night: every cue is rendered and ready.");
  });

  it("counts the silent cues and carries the first one's fix", () => {
    const p = plan([{ entry: "segments/unrendered" }, { entry: "segments/gone" }]);
    expect(readinessMessage(p, resolve(p))).toBe(
      "⚠ 2 cue(s) cannot play. Not rendered: npm run render -- --file compositions/segments/unrendered.json",
    );
  });

  it("sends you to ＋ New when there are no sessions at all", () => {
    expect(readinessMessage(null, [])).toBe("No sessions yet. Press ＋ New to start one.");
  });
});

describe("status lines", () => {
  it("prints the render command for an unrendered piece off the shelf", () => {
    expect(noEntryAudioMessage(entry("segments/unrendered"))).toBe(
      "No audio for unrendered. Run: npm run render -- --file compositions/segments/unrendered.json",
    );
  });

  it("marks a looping cue and appends its note", () => {
    expect(nowPlayingLabel("tavern", true, "while they arrive")).toBe(
      "∞ tavern — while they arrive",
    );
    expect(nowPlayingLabel("ambush", false)).toBe("▶ ambush");
  });

  it("names the session a piece was added to, and copes with none", () => {
    expect(addedMessage(entry("segments/ambush"), "night")).toBe("Added ambush to night.");
    expect(addedMessage(entry("segments/ambush"), null)).toBe("Added ambush to the session.");
  });

  it("names the file on save, and the fix when there is nobody to save with", () => {
    expect(savedMessage("night")).toBe("Saved sessions/night.json.");
    expect(saveFailedMessage("Failed to fetch")).toBe(
      "Not saved (Failed to fetch). Run npm run dev to keep session edits.",
    );
  });
});

describe("checkSessionName", () => {
  it("accepts a slug nothing else is filed under", () => {
    expect(checkSessionName("session-14", ["night"])).toEqual({ name: "session-14", error: null });
  });

  it("refuses a name that slugged away to nothing", () => {
    const { name, error } = checkSessionName("", []);
    expect(name).toBeNull();
    expect(error).toContain("no letters or numbers");
  });

  it("refuses to overwrite a running order that already exists", () => {
    expect(checkSessionName("night", ["night"]).error).toBe(
      "There is already a sessions/night.json — pick another name.",
    );
  });
});

describe("parseStoredVolume", () => {
  it("restores a level that was written", () => {
    expect(parseStoredVolume("0.4")).toBe(0.4);
    expect(parseStoredVolume("0")).toBe(0);
  });

  // The whole reason this is a function: `Number(null)` is 0, so a naive parse
  // opens the board silent on a browser that has never seen it.
  it("does not read an unset key as silence", () => {
    expect(parseStoredVolume(null)).toBeNull();
  });

  it("drops junk and out-of-range values rather than clamping them", () => {
    expect(parseStoredVolume("loud")).toBeNull();
    expect(parseStoredVolume("1.5")).toBeNull();
    expect(parseStoredVolume("-0.2")).toBeNull();
  });
});

describe("volumeRead", () => {
  it("says muted rather than 0%, so the fader position still reads", () => {
    expect(volumeRead(0.8, false)).toBe("80%");
    expect(volumeRead(0.8, true)).toBe("muted");
  });
});

describe("muteMessage", () => {
  it("names the state on the way in and the level on the way out", () => {
    expect(muteMessage(0.8, true)).toBe("Muted.");
    expect(muteMessage(0.8, false)).toBe("Volume 80%.");
  });
});
