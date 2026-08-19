import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { isSessionFile, resolveSessionPath } from "./session-store";

const root = resolve("/repo/sessions");

describe("resolveSessionPath", () => {
  it("maps a slug to sessions/<slug>.json", () => {
    expect(resolveSessionPath(root, "session-14")).toBe(resolve(root, "session-14.json"));
  });

  it("refuses anything that is not already a slug", () => {
    for (const bad of ["Session 14", "night.json", "a/b", "../secrets", "night/", "..", ""]) {
      expect(() => resolveSessionPath(root, bad)).toThrow();
    }
  });

  it("refuses a non-string name", () => {
    expect(() => resolveSessionPath(root, undefined)).toThrow("session name is required");
    expect(() => resolveSessionPath(root, 7)).toThrow("session name is required");
  });
});

describe("isSessionFile", () => {
  it("takes .json and nothing else", () => {
    expect(isSessionFile("night.json")).toBe(true);
    expect(isSessionFile("NIGHT.JSON")).toBe(true);
    expect(isSessionFile("readme.md")).toBe(false);
  });
});
