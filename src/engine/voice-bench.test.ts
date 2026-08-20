import { describe, it, expect } from "vitest";
import {
  approveLabel,
  approvedMessage,
  describeVoice,
  emptyVoicesMessage,
  forkedMessage,
  noAudioMessage,
  openingMessage,
  playingMessage,
  statusOf,
  visibleVoices,
} from "./voice-bench";
import type { VoiceEntry } from "./voice-library";
import type { VoicePreset } from "./voice";

const entry = (over: Partial<VoiceEntry> = {}, preset: Partial<VoicePreset> = {}): VoiceEntry => ({
  id: "lead/molten",
  instrument: "lead",
  slug: "molten",
  path: "voices/lead/molten.json",
  issues: [],
  ...over,
  preset: {
    instrument: "lead",
    slug: "molten",
    title: "Molten",
    status: "draft",
    ...preset,
  } as VoicePreset,
});

describe("visibleVoices", () => {
  const shelf = [
    entry({ id: "lead/molten", instrument: "lead", slug: "molten" }),
    entry({ id: "lead/glass", instrument: "lead", slug: "glass" }, { status: "approved" }),
    entry({ id: "pad/haze", instrument: "pad", slug: "haze" }, { status: "approved" }),
  ];

  it("shows everything on the All tab", () => {
    expect(visibleVoices(shelf, null, false)).toHaveLength(3);
  });

  it("narrows to one instrument", () => {
    expect(visibleVoices(shelf, "lead", false).map((e) => e.id)).toEqual([
      "lead/molten",
      "lead/glass",
    ]);
  });

  it("drops approved voices when the filter is on", () => {
    expect(visibleVoices(shelf, null, true).map((e) => e.id)).toEqual(["lead/molten"]);
  });
});

describe("statusOf", () => {
  it("reports the file's own status when it is valid", () => {
    expect(statusOf(entry())).toBe("draft");
    expect(statusOf(entry({}, { status: "approved" }))).toBe("approved");
  });

  it("outranks an approved file that no longer validates", () => {
    const broken = entry({ issues: [{ path: "synth", message: "is required" }] }, { status: "approved" });
    expect(statusOf(broken)).toBe("broken");
  });
});

describe("describeVoice", () => {
  it("heads with the title and id, and marks the instrument's default", () => {
    expect(describeVoice(entry()).label).toBe("Molten — lead/molten");
    expect(describeVoice(entry({}, { default: true })).label).toBe("Molten — lead/molten (default)");
  });

  it("shows summary and notes a blank line apart", () => {
    const described = describeVoice(entry({}, { summary: "Bright.", notes: "Cuts at 2k." }));
    expect(described.notes).toBe("Bright.\n\nCuts at 2k.");
    expect(described.broken).toBe(false);
  });

  it("asks for the missing halves rather than showing a gap", () => {
    const described = describeVoice(entry({}, { summary: "Bright." }));
    expect(described.notes).toContain("Bright.");
    expect(described.notes).toContain("No notes yet");
  });

  it("replaces both with the validation issues when the file is broken", () => {
    const described = describeVoice(
      entry({ issues: [{ path: "synth.type", message: "is unknown" }] }, { summary: "Bright." }),
    );
    expect(described.notes).toBe("synth.type is unknown");
    expect(described.broken).toBe(true);
  });
});

describe("approveLabel", () => {
  it("offers the way back for an approved voice", () => {
    expect(approveLabel(entry({}, { status: "approved" }))).toBe("↩ Back to draft");
    expect(approveLabel(entry())).toBe("✓ Approve");
    expect(approveLabel(null)).toBe("✓ Approve");
  });
});

describe("emptyVoicesMessage", () => {
  it("says the filter is what emptied the table", () => {
    expect(emptyVoicesMessage("lead", true)).toBe("No drafts here — everything is approved.");
  });

  it("names the folder and how to fill it", () => {
    expect(emptyVoicesMessage("lead", false)).toContain("Nothing in voices/lead yet.");
    expect(emptyVoicesMessage("lead", false)).toContain("npm run voice:new");
  });

  it("survives the All tab, which has no folder", () => {
    expect(emptyVoicesMessage(null, false)).toContain("Nothing in voices/ yet.");
  });
});

describe("status messages", () => {
  it("turns a missing render into the command that fixes it", () => {
    expect(noAudioMessage("lead/molten")).toBe(
      "No audio for lead/molten. Run: npm run voice:render -- --voice lead/molten",
    );
  });

  it("rounds the length and carries the --force re-render", () => {
    const message = playingMessage("lead/molten", { seconds: 12.4, renderedOn: "19/08/2026" });
    expect(message).toContain("12s, rendered 19/08/2026");
    expect(message).toContain("--voice lead/molten --force");
  });

  it("names what an approval demoted, and stays quiet when it demoted nothing", () => {
    expect(approvedMessage("lead/molten", ["lead/glass"])).toBe(
      "Approved lead/molten — it is in voices/archive.md now, and lead/glass is no longer the default.",
    );
    expect(approvedMessage("lead/molten", [])).toBe(
      "Approved lead/molten — it is in voices/archive.md now.",
    );
  });

  it("tells a fork what to do next", () => {
    expect(forkedMessage("lead/molten-2")).toContain("npm run voice:render -- --voice lead/molten-2");
  });

  it("explains dead buttons in a built bundle, and an empty shelf either way", () => {
    expect(openingMessage(0, true)).toBe("No voices found under voices/.");
    expect(openingMessage(0, false)).toBe("No voices found under voices/.");
    expect(openingMessage(3, false)).toContain("Read-only build");
    expect(openingMessage(3, true)).toContain("Approve keeps it");
  });
});
