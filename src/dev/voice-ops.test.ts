import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { approve, fork, unapprove } from "./voice-ops";
import { readVoices, voiceFile, writeVoice } from "./voice-store";
import type { VoicePreset } from "../engine/voice";

/**
 * These touch the filesystem on purpose: the rules are tested pure in
 * `voice-library.test.ts`, and what is left to get wrong here is the wiring —
 * which file gets written, and whether the archive keeps up with it.
 */
let root: string;

const preset = (over: Partial<VoicePreset> = {}): VoicePreset =>
  ({
    instrument: "bass",
    slug: "saw-round",
    title: "Round saw",
    status: "draft",
    synth: {
      kind: "synth",
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.6 },
    },
    ...over,
  }) as VoicePreset;

const read = (id: string): VoicePreset =>
  JSON.parse(readFileSync(voiceFile(id, root), "utf8")) as VoicePreset;

const archive = (): string => readFileSync(resolve(root, "archive.md"), "utf8");

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "voices-"));
  writeVoice(voiceFile("bass/saw-round", root), preset());
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("approve", () => {
  it("stamps the file and writes the archive", () => {
    const result = approve("bass/saw-round", { root, today: new Date("2026-08-14") });
    expect(result.preset.status).toBe("approved");
    expect(read("bass/saw-round").approvedAt).toBe("2026-08-14");
    expect(archive()).toContain("bass/saw-round");
  });

  it("demotes the incumbent default in the same call", () => {
    writeVoice(voiceFile("bass/sub-drone", root), preset({ slug: "sub-drone", default: true }));
    const result = approve("bass/saw-round", { root, makeDefault: true });
    expect(result.demoted).toEqual(["bass/sub-drone"]);
    expect(read("bass/sub-drone").default).toBeUndefined();
    expect(read("bass/saw-round").default).toBe(true);
  });

  it("leaves other instruments' defaults alone", () => {
    writeVoice(
      voiceFile("lead/brown-lead", root),
      preset({ instrument: "lead", slug: "brown-lead", default: true }),
    );
    approve("bass/saw-round", { root, makeDefault: true });
    expect(read("lead/brown-lead").default).toBe(true);
  });

  it("drops a voice from the archive when it goes back to draft", () => {
    approve("bass/saw-round", { root });
    unapprove("bass/saw-round", { root });
    expect(read("bass/saw-round").status).toBe("draft");
    expect(read("bass/saw-round").approvedAt).toBeUndefined();
    expect(archive()).not.toContain("bass/saw-round");
  });

  it("refuses a voice that does not exist", () => {
    expect(() => approve("bass/nope", { root })).toThrow(/no such voice/);
  });

  it("refuses a voice that is not valid yet", () => {
    writeVoice(voiceFile("bass/broken", root), { instrument: "bass", slug: "broken" } as VoicePreset);
    expect(() => approve("bass/broken", { root })).toThrow(/not valid/);
  });
});

describe("fork", () => {
  it("copies a voice to a new draft slug", () => {
    approve("bass/saw-round", { root, makeDefault: true });
    const result = fork({ root, from: "bass/saw-round", slug: "sub-drone", title: "Sub drone" });
    expect(result.id).toBe("bass/sub-drone");

    const forked = read("bass/sub-drone");
    expect(forked.status).toBe("draft");
    expect(forked.title).toBe("Sub drone");
    expect(forked.forkedFrom).toBe("bass/saw-round");
    expect(forked.default).toBeUndefined();
    expect(forked.synth).toEqual(preset().synth);

    // The whole point: the approved take is untouched by the refinement.
    const source = read("bass/saw-round");
    expect(source.status).toBe("approved");
    expect(source.default).toBe(true);
  });

  it("forks the instrument's default when no source is named", () => {
    writeVoice(voiceFile("bass/other", root), preset({ slug: "other", default: true }));
    expect(fork({ root, instrument: "bass", slug: "third" }).preset.forkedFrom).toBe("bass/other");
  });

  it("will not overwrite an existing voice", () => {
    expect(() => fork({ root, from: "bass/saw-round", slug: "saw-round" })).toThrow(/already exists/);
  });

  it("says what to do when the instrument has nothing to fork", () => {
    expect(() => fork({ root, instrument: "pad", slug: "x" })).toThrow(/no voice to fork/);
  });

  it("does not touch the archive — a draft is not approved", () => {
    approve("bass/saw-round", { root });
    fork({ root, from: "bass/saw-round", slug: "sub-drone" });
    expect(archive()).not.toContain("sub-drone");
    expect(readVoices(root)).toHaveLength(2);
  });
});
