import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { TAKES_DIR, isTakeFile, resolveTakePath, takeRelativePath } from "./take-store";

const ROOT = resolve("/project", TAKES_DIR);

describe("resolveTakePath", () => {
  it("writes a slug into the takes folder", () => {
    expect(resolveTakePath(ROOT, "tavern-hook")).toBe(resolve(ROOT, "tavern-hook.take.json"));
  });

  it("refuses an empty or missing name", () => {
    expect(() => resolveTakePath(ROOT, "")).toThrow(/required/);
    expect(() => resolveTakePath(ROOT, "   ")).toThrow(/required/);
    expect(() => resolveTakePath(ROOT, undefined)).toThrow(/required/);
    expect(() => resolveTakePath(ROOT, 7)).toThrow(/required/);
  });

  it("refuses a name that is not already a slug rather than rewriting it", () => {
    expect(() => resolveTakePath(ROOT, "Tavern Hook")).toThrow(/must be a slug/);
  });

  it("refuses traversal", () => {
    for (const name of ["../secret", "..", "a/b", "a\\b", "/etc/passwd"]) {
      expect(() => resolveTakePath(ROOT, name)).toThrow();
    }
  });
});

describe("isTakeFile", () => {
  it("takes only the double extension", () => {
    expect(isTakeFile("hook.take.json")).toBe(true);
    expect(isTakeFile("hook.json")).toBe(false);
    expect(isTakeFile("hook.wav")).toBe(false);
  });
});

describe("takeRelativePath", () => {
  it("is the path the page prints and the CLI reads", () => {
    expect(takeRelativePath("tavern-hook")).toBe("recordings/keys/tavern-hook.take.json");
  });
});
