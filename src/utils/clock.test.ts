import { describe, it, expect } from "vitest";
import { formatClock } from "./clock";

describe("formatClock", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9.6)).toBe("0:09"); // floors, so the clock never shows a time not yet reached
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(599)).toBe("9:59");
  });

  it("grows an hours field only when it needs one", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("renders something readable for junk input", () => {
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});
