import { describe, expect, it } from "vitest";
import { reloadReason } from "./live-library-rules";

describe("reloadReason", () => {
  it("treats a new composition or voice as a library change", () => {
    expect(reloadReason("compositions/segments/dog-dies.json")).toBe("library");
    expect(reloadReason("compositions/loops/vulture-mile.json")).toBe("library");
    expect(reloadReason("voices/lead/molten.json")).toBe("library");
  });

  it("treats rendered output as an audio change", () => {
    expect(reloadReason("public/audio/dog-dies.mp3")).toBe("audio");
    expect(reloadReason("public/audio/manifest.json")).toBe("audio");
    expect(reloadReason("public/audio/voices/lead__molten.wav")).toBe("audio");
  });

  it("reads Windows separators the same way", () => {
    expect(reloadReason("compositions\\segments\\dog-dies.json")).toBe("library");
    expect(reloadReason("public\\audio\\manifest.json")).toBe("audio");
  });

  it("ignores the trash, so deleting a piece does not list it back", () => {
    expect(reloadReason("compositions/_trash/dog-dies.json")).toBeNull();
  });

  it("ignores everything Vite already handles", () => {
    for (const path of [
      "src/app/main.ts",
      "readme.md",
      "voices/archive.md",
      "compositions/segments/notes.txt",
      "palettes/emotion/sad.md",
      "public/favicon.svg",
      "../outside-the-root/compositions/x.json",
    ]) {
      expect(reloadReason(path), path).toBeNull();
    }
  });

  it("never reloads for a session plan", () => {
    // Saving a running order must not reload the page: the session board writes
    // on every click, and a reload would stop the cue that is playing.
    expect(reloadReason("sessions/session-14.json")).toBeNull();
  });
});
