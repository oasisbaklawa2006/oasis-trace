import { describe, it, expect } from "vitest";
import { computeBestBefore } from "./dateMath";

describe("computeBestBefore", () => {
  it("adds shelf-life days to a control date with no DST transition", () => {
    expect(computeBestBefore("2026-01-01", 90)).toBe("2026-04-01");
  });

  it("stays correct across the US spring-forward DST transition", () => {
    // Local setDate() arithmetic in America/New_York would drift this by a
    // day around the March DST transition — UTC arithmetic must not.
    expect(computeBestBefore("2026-03-01", 90)).toBe("2026-05-30");
  });

  it("stays correct across the US fall-back DST transition", () => {
    expect(computeBestBefore("2026-11-01", 90)).toBe("2027-01-30");
  });

  it("handles a zero shelf life as a no-op", () => {
    expect(computeBestBefore("2026-06-15", 0)).toBe("2026-06-15");
  });
});
