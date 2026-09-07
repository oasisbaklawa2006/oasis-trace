import { describe, expect, it, vi } from "vitest";
import { clearAsyncLocks, withAsyncLock } from "./asyncLock";

describe("asyncLock", () => {
  it("serializes overlapping calls for the same key", async () => {
    clearAsyncLocks();
    let active = 0;
    let maxActive = 0;
    const work = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 20));
      active -= 1;
      return "done";
    };
    const results = await Promise.all([
      withAsyncLock("k1", work),
      withAsyncLock("k1", work),
    ]);
    expect(results).toEqual(["done", "done"]);
    expect(maxActive).toBe(1);
  });
});
