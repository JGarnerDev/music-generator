import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { resolveTrashMove } from "./trash";

const dir = resolve("/repo/compositions");

describe("resolveTrashMove", () => {
  it("mirrors the kind folder inside _trash", () => {
    const move = resolveTrashMove(dir, "compositions/loops/camp.json");
    expect(move.from).toBe(resolve(dir, "loops/camp.json"));
    expect(move.to).toBe(resolve(dir, "_trash/loops/camp.json"));
    expect(move.label).toBe("loops/camp.json");
  });

  it("accepts a path already relative to compositions/", () => {
    expect(resolveTrashMove(dir, "segments/demo-sad.json").label).toBe("segments/demo-sad.json");
  });

  it("stamps the name when that file is already in the trash", () => {
    const move = resolveTrashMove(dir, "loops/camp.json", { exists: () => true, stamp: "42" });
    expect(move.label).toBe("loops/camp.42.json");
  });

  it("refuses to touch anything outside compositions/", () => {
    for (const bad of [
      "../package.json",
      "compositions/../../secrets.json",
      "loops/../../.env.json",
      "/etc/passwd.json",
      "C:\\Windows\\system.json",
    ]) {
      expect(() => resolveTrashMove(dir, bad)).toThrow();
    }
  });

  it("refuses non-json, empty, and already-trashed paths", () => {
    expect(() => resolveTrashMove(dir, "loops/camp.wav")).toThrow(/not a composition file/);
    expect(() => resolveTrashMove(dir, "   ")).toThrow(/no composition path/);
    expect(() => resolveTrashMove(dir, "_trash/loops/camp.json")).toThrow(/already in the trash/);
  });
});
