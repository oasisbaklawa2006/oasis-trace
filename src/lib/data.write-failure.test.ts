/**
 * Hard-fail behavior when Supabase is configured but a write fails.
 *
 * insertRow/updateRow must THROW in that case rather than silently falling
 * back to the local demo store — that fallback is reserved for the case
 * where Supabase is not configured at all (no env vars). This file replaces
 * an earlier version whose "tests" were `expect(true).toBe(true)` placeholders
 * that never actually imported or exercised the mocked failure path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let configured = true;
// Set per-test to control what the mocked Supabase client's terminal
// `.single()` call resolves/rejects with.
let singleImpl: () => Promise<{ data: unknown; error: unknown }> = async () => ({ data: { id: "row-1" }, error: null });

function makeSupabaseStub() {
  const terminal = { single: () => singleImpl() };
  return {
    from: (_table: string) => ({
      insert: (_row: unknown) => ({ select: () => terminal }),
      update: (_patch: unknown) => ({ eq: (_col: string, _val: unknown) => ({ select: () => terminal }) }),
      select: () => ({ limit: () => ({ head: false, count: "exact" }) }),
    }),
  };
}

vi.mock("./supabase", () => ({
  get supabase() { return configured ? makeSupabaseStub() : null; },
  get supabaseConfigured() { return configured; },
}));

async function freshData() {
  vi.resetModules();
  return await import("./data");
}

beforeEach(() => {
  configured = true;
  singleImpl = async () => ({ data: { id: "row-1" }, error: null });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("insertRow: hard-fail when Supabase is configured but write fails", () => {
  it("throws (does not return demo data) when the insert rejects", async () => {
    singleImpl = async () => { throw new Error("Connection refused: Supabase unreachable"); };
    const { insertRow } = await freshData();

    await expect(insertRow("ols_test_table", { test: "data" })).rejects.toThrow(
      /Cannot save to database/
    );
  });

  it("throws when the insert resolves with a Supabase error object", async () => {
    singleImpl = async () => ({ data: null, error: { message: "permission denied for table ols_test_table" } });
    const { insertRow } = await freshData();

    await expect(insertRow("ols_test_table", { test: "data" })).rejects.toThrow(
      /Cannot save to database/
    );
  });

  it("includes the underlying error message so operators/logs have real context", async () => {
    singleImpl = async () => { throw new Error("Connection refused: Supabase unreachable"); };
    const { insertRow } = await freshData();

    await expect(insertRow("ols_test_table", { test: "data" })).rejects.toThrow(
      /Connection refused: Supabase unreachable/
    );
  });

  it("does not flip the app mode to demo on a hard-fail (no demo fallback occurred)", async () => {
    singleImpl = async () => { throw new Error("network down"); };
    const { insertRow, getMode } = await freshData();

    await expect(insertRow("ols_test_table", { test: "data" })).rejects.toThrow();
    // Regression guard for the bug this test file was added to catch: a
    // hard-failed write must not be reported as "Demo Fallback Mode" in the
    // UI (see src/components/AppShell.tsx), since nothing actually fell
    // back to demo storage.
    expect(getMode()).not.toBe("demo");
  });

  it("still resolves normally when the insert succeeds", async () => {
    singleImpl = async () => ({ data: { id: "row-42" }, error: null });
    const { insertRow } = await freshData();

    const row = await insertRow<{ id: string }>("ols_test_table", { test: "data" });
    expect(row.id).toBe("row-42");
  });

  it("preserves duplicate-entry handling as a distinct, friendly error", async () => {
    singleImpl = async () => {
      const err = new Error("duplicate key value violates unique constraint") as Error & { code?: string };
      err.code = "23505";
      throw err;
    };
    const { insertRow } = await freshData();

    await expect(insertRow("ols_test_table", { test: "data" })).rejects.toThrow("Duplicate entry blocked");
  });
});

describe("updateRow: hard-fail when Supabase is configured but write fails", () => {
  it("throws (does not return demo data) when the update rejects", async () => {
    singleImpl = async () => { throw new Error("Connection refused: Supabase unreachable"); };
    const { updateRow } = await freshData();

    await expect(updateRow("ols_test_table", "row-1", { test: "data" })).rejects.toThrow(
      /Cannot save to database/
    );
  });

  it("does not flip the app mode to demo on a hard-fail", async () => {
    singleImpl = async () => { throw new Error("network down"); };
    const { updateRow, getMode } = await freshData();

    await expect(updateRow("ols_test_table", "row-1", { test: "data" })).rejects.toThrow();
    expect(getMode()).not.toBe("demo");
  });

  it("still resolves normally when the update succeeds", async () => {
    singleImpl = async () => ({ data: { id: "row-1", test: "data" }, error: null });
    const { updateRow } = await freshData();

    const row = await updateRow<{ id: string }>("ols_test_table", "row-1", { test: "data" });
    expect(row?.id).toBe("row-1");
  });
});

describe("Demo mode (no Supabase env vars): fallback is preserved", () => {
  it("insertRow silently uses the local demo store when Supabase is not configured", async () => {
    configured = false;
    const { insertRow } = await freshData();

    // Should NOT throw and should NOT hit the mocked Supabase client at all —
    // this is the intentional, explicit demo-mode path (no env vars).
    const row = await insertRow<{ id: string }>("ols_demo_table", { foo: "bar" });
    expect(row).toBeTruthy();
    expect(row.id).toBeTruthy();
  });

  it("updateRow silently uses the local demo store when Supabase is not configured", async () => {
    configured = false;
    const { insertRow, updateRow } = await freshData();

    const created = await insertRow<{ id: string }>("ols_demo_table", { foo: "bar" });
    const updated = await updateRow<{ id: string; foo: string }>("ols_demo_table", created.id, { foo: "baz" });
    expect(updated?.foo).toBe("baz");
  });
});
