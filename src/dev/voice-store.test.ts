import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { readVoices, voiceFile, voicesRoot } from "./voice-store";
import { probeComposition } from "../engine/probe";
import { validateComposition } from "../engine/composition";

describe("voiceFile", () => {
  const root = resolve("/tmp/voices");

  it("maps an id to its file", () => {
    expect(voiceFile("lead/molten", root)).toBe(resolve(root, "lead", "molten.json"));
    expect(voiceFile("  drums/house-kit  ", root)).toBe(resolve(root, "drums", "house-kit.json"));
  });

  it("rejects anything that could leave voices/", () => {
    // The id arrives from a command line *and* from an HTTP request, so the
    // pattern is the guard: no traversal, no separators, no extensions.
    for (const bad of [
      "../secrets",
      "lead/../../etc/passwd",
      "lead/molten.json",
      "/lead/molten",
      "lead\\molten",
      "lead/Molten",
      "lead//molten",
      "lead",
      "",
    ]) {
      expect(() => voiceFile(bad, root), bad).toThrow();
    }
  });

  it("rejects a folder that is not an instrument", () => {
    expect(() => voiceFile("kazoo/party", root)).toThrow(/unknown instrument/);
  });
});

describe("the voices in this repo", () => {
  const entries = readVoices(voicesRoot());

  it("are all valid", () => {
    const broken = entries.filter((entry) => entry.issues.length > 0);
    expect(broken.map((entry) => `${entry.id}: ${entry.issues[0]!.path}`)).toEqual([]);
  });

  it("give every instrument exactly one default", () => {
    const defaults = new Map<string, string[]>();
    for (const entry of entries) {
      if (entry.preset.default) {
        defaults.set(entry.instrument, [...(defaults.get(entry.instrument) ?? []), entry.slug]);
      }
    }
    for (const [instrument, slugs] of defaults) {
      expect(slugs, `${instrument} has more than one default`).toHaveLength(1);
    }
  });

  it("each render a valid probe composition", () => {
    for (const entry of entries) {
      expect(validateComposition(probeComposition(entry.preset)), entry.id).toEqual([]);
    }
  });
});
