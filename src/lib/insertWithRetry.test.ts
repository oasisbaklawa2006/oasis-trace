// Safety property: this must NEVER loop unbounded, must only retry on a
// confirmed unique-constraint collision (not any other error), and must
// call buildRow() fresh each attempt so a regenerated identifier is
// actually used (not the same colliding value resubmitted).
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { calls: 0, failUntilAttempt: 0, throwNonDuplicateOnAttempt: 0 };

vi.mock("@/lib/data", () => ({
  insertRow: vi.fn(async (_table: string, row: Record<string, unknown>) => {
    state.calls++;
    if (state.throwNonDuplicateOnAttempt && state.calls === state.throwNonDuplicateOnAttempt) {
      throw new Error("permission denied");
    }
    if (state.calls <= state.failUntilAttempt) {
      const err = new Error("duplicate key value violates unique constraint") as Error & { code: string };
      err.code = "23505";
      throw err;
    }
    return { id: "row-1", ...row };
  }),
  isDuplicateError: vi.fn((err: unknown) => (err as { code?: string })?.code === "23505"),
}));

import { insertWithUniqueRetry } from "./insertWithRetry";

beforeEach(() => {
  state.calls = 0;
  state.failUntilAttempt = 0;
  state.throwNonDuplicateOnAttempt = 0;
});

describe("insertWithUniqueRetry", () => {
  it("succeeds on the first attempt when there's no collision", async () => {
    const row = await insertWithUniqueRetry("ols_cartons", () => ({ carton_no: "CTN-1" }));
    expect(row).toMatchObject({ carton_no: "CTN-1" });
    expect(state.calls).toBe(1);
  });

  it("retries on a confirmed 23505 collision and succeeds once a fresh id doesn't collide", async () => {
    state.failUntilAttempt = 2; // first 2 attempts collide, 3rd succeeds
    let n = 0;
    const row = await insertWithUniqueRetry<{ carton_no: string }>("ols_cartons", () => ({ carton_no: `CTN-${++n}` }));
    expect(state.calls).toBe(3);
    expect(row.carton_no).toBe("CTN-3"); // proves buildRow() was called fresh each attempt
  });

  it("calls buildRow() exactly once per attempt — never reuses a colliding value", async () => {
    state.failUntilAttempt = 1;
    const buildRow = vi.fn(() => ({ carton_no: "whatever" }));
    await insertWithUniqueRetry("ols_cartons", buildRow);
    expect(buildRow).toHaveBeenCalledTimes(2);
  });

  it("never loops unbounded: gives up and throws after maxAttempts consecutive collisions", async () => {
    state.failUntilAttempt = 999; // always collides
    await expect(insertWithUniqueRetry("ols_cartons", () => ({ carton_no: "X" }), 3)).rejects.toThrow(/duplicate/i);
    expect(state.calls).toBe(3); // exactly the cap, not more
  });

  it("does not retry a non-duplicate error — propagates immediately on attempt 1", async () => {
    state.throwNonDuplicateOnAttempt = 1;
    await expect(insertWithUniqueRetry("ols_cartons", () => ({ carton_no: "X" }))).rejects.toThrow("permission denied");
    expect(state.calls).toBe(1);
  });

  it("respects a custom maxAttempts", async () => {
    state.failUntilAttempt = 10;
    await expect(insertWithUniqueRetry("ols_cartons", () => ({ carton_no: "X" }), 2)).rejects.toThrow();
    expect(state.calls).toBe(2);
  });
});
