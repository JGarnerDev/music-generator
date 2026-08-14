import { describe, expect, it } from "vitest";
import {
  approvePreset,
  buildVoiceLibrary,
  clearDefaults,
  countsByInstrument,
  draftPreset,
  forkPreset,
  instrumentFromPath,
  renderVoiceArchive,
  resolveVoice,
  searchVoices,
  voiceAudioName,
  voicesOf,
} from "./voice-library";
import type { VoicePreset } from "./voice";

const preset = (over: Partial<VoicePreset> = {}): VoicePreset =>
  ({
    instrument: "bass",
    slug: "round-thumb",
    title: "Round thumb",
    status: "draft",
    synth: {
      kind: "synth",
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.6 },
    },
    ...over,
  }) as VoicePreset;

/** A library keyed the way Vite's glob hands paths over. */
const files = (entries: Record<string, VoicePreset>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(entries).map(([path, p]) => [`../../${path}`, p]));

describe("instrumentFromPath", () => {
  it("reads the instrument off the folder", () => {
    expect(instrumentFromPath("voices/lead/molten.json")).toBe("lead");
    expect(instrumentFromPath("../../voices/drums/house-kit.json")).toBe("drums");
    expect(instrumentFromPath("voices\\bass\\round-thumb.json")).toBe("bass");
  });

  it("returns null for a folder that is not an instrument", () => {
    expect(instrumentFromPath("voices/kazoo/x.json")).toBeNull();
    expect(instrumentFromPath("voices/x.json")).toBeNull();
  });
});

describe("buildVoiceLibrary", () => {
  it("files voices by folder and sorts them by instrument then slug", () => {
    const entries = buildVoiceLibrary(
      files({
        "voices/lead/molten.json": preset({ instrument: "lead", slug: "molten" }),
        "voices/bass/round-thumb.json": preset(),
        "voices/bass/a-first.json": preset({ slug: "a-first" }),
      }),
    );
    expect(entries.map((e) => e.id)).toEqual(["bass/a-first", "bass/round-thumb", "lead/molten"]);
  });

  it("lets the folder and filename win over stale fields in the file", () => {
    const [entry] = buildVoiceLibrary(
      files({ "voices/pad/warm-glass.json": preset({ instrument: "bass", slug: "old-name" }) }),
    );
    expect(entry!.preset.instrument).toBe("pad");
    expect(entry!.preset.slug).toBe("warm-glass");
  });

  it("keeps an invalid preset but flags it, rather than hiding it", () => {
    const [entry] = buildVoiceLibrary(
      files({ "voices/bass/broken.json": { instrument: "bass", slug: "broken" } as VoicePreset }),
    );
    expect(entry!.id).toBe("bass/broken");
    expect(entry!.issues.length).toBeGreaterThan(0);
  });

  it("drops files that are not under an instrument folder", () => {
    expect(buildVoiceLibrary(files({ "voices/notes.json": preset() }))).toEqual([]);
  });
});

describe("resolveVoice", () => {
  const entries = buildVoiceLibrary(
    files({
      "voices/bass/round-thumb.json": preset({ status: "approved", default: true }),
      "voices/bass/sub-drone.json": preset({ slug: "sub-drone", status: "approved" }),
      "voices/bass/experiment.json": preset({ slug: "experiment" }),
      "voices/lead/draft-only.json": preset({ instrument: "lead", slug: "draft-only" }),
      "voices/pad/broken.json": { instrument: "pad", slug: "broken" } as VoicePreset,
    }),
  );

  it("returns the voice a track names", () => {
    expect(resolveVoice(entries, "bass", "sub-drone")?.id).toBe("bass/sub-drone");
  });

  it("returns null when the named voice does not exist", () => {
    expect(resolveVoice(entries, "bass", "nope")).toBeNull();
  });

  it("falls back to the flagged default", () => {
    expect(resolveVoice(entries, "bass")?.slug).toBe("round-thumb");
  });

  it("prefers an approved voice over a draft when nothing is flagged", () => {
    const noDefault = buildVoiceLibrary(
      files({
        "voices/bass/a-draft.json": preset({ slug: "a-draft" }),
        "voices/bass/z-approved.json": preset({ slug: "z-approved", status: "approved" }),
      }),
    );
    expect(resolveVoice(noDefault, "bass")?.slug).toBe("z-approved");
  });

  it("still returns a draft when that is all there is", () => {
    expect(resolveVoice(entries, "lead")?.slug).toBe("draft-only");
  });

  it("never resolves to an invalid preset", () => {
    expect(resolveVoice(entries, "pad")).toBeNull();
    expect(resolveVoice(entries, "pad", "broken")).toBeNull();
  });

  it("returns null for an instrument with no voices", () => {
    expect(resolveVoice(entries, "epiano")).toBeNull();
  });
});

describe("voicesOf / countsByInstrument / searchVoices", () => {
  const entries = buildVoiceLibrary(
    files({
      "voices/bass/round-thumb.json": preset({ tags: ["warm", "motown"] }),
      "voices/bass/sub-drone.json": preset({ slug: "sub-drone", title: "Sub drone" }),
      "voices/lead/molten.json": preset({ instrument: "lead", slug: "molten" }),
    }),
  );

  it("filters by instrument, with null meaning all", () => {
    expect(voicesOf(entries, "bass")).toHaveLength(2);
    expect(voicesOf(entries, null)).toHaveLength(3);
  });

  it("counts every instrument, including the empty ones", () => {
    const counts = countsByInstrument(entries);
    expect(counts.bass).toBe(2);
    expect(counts.lead).toBe(1);
    expect(counts.piano).toBe(0);
  });

  it("searches slug, title and tags", () => {
    expect(searchVoices(entries, "motown").map((e) => e.slug)).toEqual(["round-thumb"]);
    expect(searchVoices(entries, "SUB").map((e) => e.slug)).toEqual(["sub-drone"]);
    expect(searchVoices(entries, "")).toHaveLength(3);
  });
});

describe("voiceAudioName", () => {
  it("names the probe render for a voice", () => {
    expect(voiceAudioName("lead", "molten")).toBe("lead.molten");
  });
});

describe("approvePreset / draftPreset / forkPreset / clearDefaults", () => {
  it("stamps the date and the status on approval", () => {
    const approved = approvePreset(preset(), { today: "2026-08-14" });
    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).toBe("2026-08-14");
  });

  it("only flags a default when asked", () => {
    expect(approvePreset(preset(), { today: "2026-08-14" }).default).toBeUndefined();
    expect(approvePreset(preset(), { today: "2026-08-14", makeDefault: true }).default).toBe(true);
  });

  it("drops the approval date when a voice goes back to draft", () => {
    const approved = approvePreset(preset(), { today: "2026-08-14" });
    const back = draftPreset(approved);
    expect(back.status).toBe("draft");
    expect(back.approvedAt).toBeUndefined();
  });

  it("forks to a new slug in draft, remembering the parent", () => {
    const source = approvePreset(preset({ default: true }), { today: "2026-08-14" });
    const forked = forkPreset(source, { slug: "sub-drone" });
    expect(forked.slug).toBe("sub-drone");
    expect(forked.status).toBe("draft");
    expect(forked.forkedFrom).toBe("bass/round-thumb");
    // A fork inherits the sound, never the standing: two defaults would make the
    // instrument's default depend on sort order.
    expect(forked.default).toBeUndefined();
    expect(forked.approvedAt).toBeUndefined();
  });

  it("keeps the source untouched — that is the point of forking", () => {
    const source = preset({ status: "approved" });
    forkPreset(source, { slug: "other" });
    expect(source.slug).toBe("round-thumb");
    expect(source.status).toBe("approved");
  });

  it("names a fork after its parent unless told otherwise", () => {
    expect(forkPreset(preset(), { slug: "x" }).title).toBe("Round thumb (fork)");
    expect(forkPreset(preset(), { slug: "x", title: "Sub drone" }).title).toBe("Sub drone");
  });

  it("finds the defaults that have to be cleared, and only those", () => {
    const entries = buildVoiceLibrary(
      files({
        "voices/bass/old.json": preset({ slug: "old", default: true }),
        "voices/bass/new.json": preset({ slug: "new", default: true }),
        "voices/bass/plain.json": preset({ slug: "plain" }),
        "voices/lead/other.json": preset({ instrument: "lead", slug: "other", default: true }),
      }),
    );
    expect(clearDefaults(entries, "bass", "new").map((e) => e.id)).toEqual(["bass/old"]);
  });
});

describe("renderVoiceArchive", () => {
  const entries = buildVoiceLibrary(
    files({
      "voices/bass/round-thumb.json": preset({
        status: "approved",
        default: true,
        approvedAt: "2026-08-14",
        tags: ["warm"],
        notes: "Motown thumb: fat low end that still moves.",
      }),
      "voices/bass/experiment.json": preset({ slug: "experiment" }),
      "voices/lead/molten.json": preset({
        instrument: "lead",
        slug: "molten",
        status: "approved",
        approvedAt: "2026-08-14",
        forkedFrom: "lead/brown-sound",
      }),
    }),
  );

  it("opens with frontmatter, like every other md in the repo", () => {
    expect(renderVoiceArchive(entries, { updated: "2026-08-14" }).startsWith("---\n")).toBe(true);
  });

  it("lists approved voices only", () => {
    const md = renderVoiceArchive(entries, { updated: "2026-08-14" });
    expect(md).toContain("bass/round-thumb");
    expect(md).toContain("lead/molten");
    expect(md).not.toContain("experiment");
  });

  it("carries the notes, the default flag and the lineage", () => {
    const md = renderVoiceArchive(entries, { updated: "2026-08-14" });
    expect(md).toContain("Motown thumb");
    expect(md).toContain("**default**");
    expect(md).toContain("forked from `lead/brown-sound`");
    expect(md).toContain("(./bass/round-thumb.json)");
  });

  it("says so when nothing is approved yet", () => {
    const drafts = buildVoiceLibrary(files({ "voices/bass/x.json": preset({ slug: "x" }) }));
    expect(renderVoiceArchive(drafts, { updated: "2026-08-14" })).toContain("Nothing approved yet");
  });
});
