import { describe, expect, it } from "vitest";
import {
  MONITOR_PROFILES,
  defaultMonitor,
  isMonitorId,
  monitorMessage,
  monitorProfile,
} from "./monitor";

describe("monitorProfile", () => {
  it("is the wire when flat — no stages, no trim", () => {
    const flat = monitorProfile("flat");
    expect(flat.stages).toHaveLength(0);
    expect(flat.trim).toBe(1);
  });

  it("falls back to flat for an id that is no longer on the shelf", () => {
    expect(monitorProfile("vintage-radio" as never).id).toBe("flat");
  });

  it("trims the small-speaker boost back under unity so the limiter is not the mixer", () => {
    const small = monitorProfile("small-speaker");
    expect(small.trim).toBeLessThan(1);
    const boost = small.stages.reduce((most, stage) => Math.max(most, stage.gain ?? 0), 0);
    expect(boost).toBeGreaterThan(0);
  });

  it("takes the sub away before it boosts anything — that is the half that matters", () => {
    const [first] = monitorProfile("small-speaker").stages;
    expect(first?.type).toBe("highpass");
    expect(first?.hz).toBeGreaterThanOrEqual(80);
  });
});

describe("defaultMonitor", () => {
  it("corrects for a finger, which means a phone", () => {
    expect(defaultMonitor(true)).toBe("small-speaker");
  });

  it("leaves a mouse alone — headphones are already a full-range monitor", () => {
    expect(defaultMonitor(false)).toBe("flat");
  });
});

describe("isMonitorId", () => {
  it("accepts what the shelf has and refuses anything else", () => {
    for (const profile of MONITOR_PROFILES) expect(isMonitorId(profile.id)).toBe(true);
    expect(isMonitorId("loud")).toBe(false);
    expect(isMonitorId(null)).toBe(false);
  });
});

describe("monitorMessage", () => {
  it("says renders are untouched, because that is what a correction makes you doubt", () => {
    expect(monitorMessage("small-speaker")).toMatch(/render/i);
    expect(monitorMessage("flat")).toMatch(/render/i);
  });
});
