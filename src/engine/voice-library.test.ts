import { describe, expect, it } from "vitest";
import {
  approvePreset,
  buildVoiceLibrary,
  clearDefaults,
  countsByInstrument,
  draftPreset,
  findVoices,
  forkPreset,
  instrumentFromPath,
  lineageOf,
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

  it("keeps the parent's notes on a fork but never its summary", () => {
    const forked = forkPreset(
      preset({ summary: "The settled one.", notes: "Why the detune is 22 cents." }),
      { slug: "child" },
    );
    // The essay is the brief the fork is written against; the summary is the
    // archive row, and the parent's row is the wrong one for the child.
    expect(forked.notes).toBe("Why the detune is 22 cents.");
    expect(forked.summary).toBeUndefined();
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

describe("findVoices", () => {
  const entries = buildVoiceLibrary(
    files({
      "voices/lead/trumpet.json": preset({
        instrument: "lead",
        slug: "trumpet",
        status: "approved",
        tags: ["trumpet", "spaghetti-western", "brass"],
        summary: "Lone mariachi trumpet over a western cue.",
      }),
      "voices/pad/choir.json": preset({
        instrument: "pad",
        slug: "choir",
        status: "approved",
        tags: ["choir", "spaghetti-western", "section"],
        summary: "Wordless men's chorus.",
      }),
      "voices/bass/saw.json": preset({
        slug: "saw",
        status: "approved",
        tags: ["neutral"],
        summary: "Plain sawtooth that sits under a western or anything else.",
      }),
      "voices/bass/sketch.json": preset({ slug: "sketch", tags: ["spaghetti-western"] }),
    }),
  );
  const ids = (matches: { entry: { id: string } }[]) => matches.map((m) => m.entry.id);

  it("leaves drafts out unless asked — the archive lists what was signed off", () => {
    expect(ids(findVoices(entries))).not.toContain("bass/sketch");
    expect(ids(findVoices(entries, { includeDrafts: true }))).toContain("bass/sketch");
  });

  it("filters to one instrument", () => {
    expect(ids(findVoices(entries, { instrument: "pad" }))).toEqual(["pad/choir"]);
  });

  it("requires every tag asked for, not any of them", () => {
    expect(ids(findVoices(entries, { tags: ["spaghetti-western"] }))).toEqual([
      "pad/choir",
      "lead/trumpet",
    ]);
    expect(ids(findVoices(entries, { tags: ["spaghetti-western", "brass"] }))).toEqual([
      "lead/trumpet",
    ]);
  });

  it("treats query terms as alternatives and ranks by how many hit", () => {
    // The trumpet matches both terms by tag; the choir only the first.
    const ranked = findVoices(entries, { query: "spaghetti-western trumpet" });
    expect(ids(ranked)).toEqual(["lead/trumpet", "pad/choir"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("scores a tag hit above a mention in the prose", () => {
    // A scene is typed as loose words, so a bare "western" has to reach the
    // `spaghetti-western` tag — but the bass, which only says "western" in its
    // summary, must not outrank the voices actually filed under it.
    const ranked = findVoices(entries, { query: "western" });
    expect(ids(ranked)).toEqual(["pad/choir", "lead/trumpet", "bass/saw"]);
    expect(ranked.at(-1)).toEqual({ entry: expect.objectContaining({ id: "bass/saw" }), score: 1 });
  });

  it("drops voices no query term touches", () => {
    expect(ids(findVoices(entries, { query: "accordion polka" }))).toEqual([]);
  });

  it("ignores one-letter noise so a stray word cannot flatten the ranking", () => {
    expect(ids(findVoices(entries, { query: "a trumpet" }))).toEqual(["lead/trumpet"]);
  });

  it("applies tags and query together, and a query always narrows too", () => {
    // Not "the western shelf, choirs first" — the trumpet touches no term, so
    // it is out. A query means the same thing whether or not tags came with it.
    expect(ids(findVoices(entries, { tags: ["spaghetti-western"], query: "choir" }))).toEqual([
      "pad/choir",
    ]);
  });
});

describe("lineageOf", () => {
  const entries = buildVoiceLibrary(
    files({
      "voices/pad/halo.json": preset({ instrument: "pad", slug: "halo" }),
      "voices/pad/choir.json": preset({ instrument: "pad", slug: "choir", forkedFrom: "pad/halo" }),
      "voices/pad/bed.json": preset({ instrument: "pad", slug: "bed", forkedFrom: "pad/choir" }),
      "voices/pad/orphan.json": preset({
        instrument: "pad",
        slug: "orphan",
        forkedFrom: "pad/deleted",
      }),
    }),
  );

  it("walks up to the root, root first", () => {
    expect(lineageOf(entries, "pad/bed").map((e) => e.id)).toEqual([
      "pad/halo",
      "pad/choir",
      "pad/bed",
    ]);
  });

  it("is just the voice when nothing was forked", () => {
    expect(lineageOf(entries, "pad/halo").map((e) => e.id)).toEqual(["pad/halo"]);
  });

  it("stops at a parent that is no longer in the library", () => {
    expect(lineageOf(entries, "pad/orphan").map((e) => e.id)).toEqual(["pad/orphan"]);
  });

  it("is empty for a voice that does not exist", () => {
    expect(lineageOf(entries, "pad/nope")).toEqual([]);
  });

  it("cannot loop on a cycle in forkedFrom", () => {
    const cyclic = buildVoiceLibrary(
      files({
        "voices/pad/a.json": preset({ instrument: "pad", slug: "a", forkedFrom: "pad/b" }),
        "voices/pad/b.json": preset({ instrument: "pad", slug: "b", forkedFrom: "pad/a" }),
      }),
    );
    expect(lineageOf(cyclic, "pad/a").map((e) => e.id)).toEqual(["pad/b", "pad/a"]);
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
        summary: "Motown thumb: fat low end that still moves.",
        notes: "Long essay about why the filter opens at 180 Hz and what breaks either side of it.",
      }),
      "voices/bass/experiment.json": preset({ slug: "experiment" }),
      "voices/lead/molten.json": preset({
        instrument: "lead",
        slug: "molten",
        status: "approved",
        approvedAt: "2026-08-14",
        forkedFrom: "lead/brown-sound",
        summary: "Sustain that never quits.",
      }),
    }),
  );
  const md = renderVoiceArchive(entries, { updated: "2026-08-14" });

  it("opens with frontmatter, like every other md in the repo", () => {
    expect(md.startsWith("---\n")).toBe(true);
  });

  it("lists approved voices only", () => {
    expect(md).toContain("bass/round-thumb");
    expect(md).toContain("lead/molten");
    expect(md).not.toContain("experiment");
  });

  it("carries the summary, the default flag and a link to the file", () => {
    expect(md).toContain("Motown thumb");
    expect(md).toContain("**default**");
    expect(md).toContain("(./bass/round-thumb.json)");
  });

  it("leaves the design notes in the JSON — they are what made this file huge", () => {
    expect(md).not.toContain("Long essay");
  });

  it("gives each instrument one table rather than a section per voice", () => {
    expect(md).toContain("| voice | tags | when to pick it |");
    expect(md).not.toContain("### ");
  });

  it("salvages a first sentence for a voice approved before summaries existed", () => {
    const legacy = buildVoiceLibrary(
      files({
        "voices/bass/old.json": preset({
          slug: "old",
          status: "approved",
          notes: "The house bass since the first render. Everything after this sentence is detail nobody choosing a sound needs to read.",
        }),
      }),
    );
    const out = renderVoiceArchive(legacy, { updated: "2026-08-14" });
    expect(out).toContain("The house bass since the first render.");
    expect(out).not.toContain("nobody choosing a sound");
  });

  it("draws the fork trees once instead of restating lineage per entry", () => {
    const family = buildVoiceLibrary(
      files({
        "voices/pad/halo.json": preset({ instrument: "pad", slug: "halo", status: "approved" }),
        "voices/pad/choir.json": preset({
          instrument: "pad",
          slug: "choir",
          status: "approved",
          forkedFrom: "pad/halo",
        }),
        "voices/pad/bed.json": preset({
          instrument: "pad",
          slug: "bed",
          status: "approved",
          forkedFrom: "pad/choir",
        }),
      }),
    );
    const out = renderVoiceArchive(family, { updated: "2026-08-14" });
    expect(out).toContain("## Lineage");
    expect(out).toContain("pad/halo\n  pad/choir\n    pad/bed");
  });

  it("skips the lineage section when nothing has been forked", () => {
    // `lead/molten` names a parent that was never approved, so it is not a tree.
    expect(md).not.toContain("## Lineage");
  });

  it("escapes a pipe so one summary cannot eat the table", () => {
    const piped = buildVoiceLibrary(
      files({
        "voices/bass/pipe.json": preset({
          slug: "pipe",
          status: "approved",
          summary: "Fat | round | loud.",
        }),
      }),
    );
    expect(renderVoiceArchive(piped, { updated: "2026-08-14" })).toContain("Fat \\| round \\| loud.");
  });

  it("says so when nothing is approved yet", () => {
    const drafts = buildVoiceLibrary(files({ "voices/bass/x.json": preset({ slug: "x" }) }));
    expect(renderVoiceArchive(drafts, { updated: "2026-08-14" })).toContain("Nothing approved yet");
  });
});
