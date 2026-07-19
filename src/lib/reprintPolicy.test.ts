/**
 * Regression coverage for the "silent partial success" bug this PR fixes:
 * createPendingRequest() used to swallow insertRow() failures and return
 * null, while its only caller (ReprintModal.tsx) never checked the return
 * value — so a hard-failed write to ols_reprint_requests was reported to
 * the operator as "Reprint queued for supervisor approval" even though
 * nothing was persisted. approveRequest/rejectRequest's audit mirror used a
 * bespoke silent-swallow (safeAudit) instead of the shared, retry-safe
 * audit() helper — this file confirms both are fixed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dataState = {
  insertShouldFail: false,
  insertError: "insert failed",
  updateShouldFail: false,
  updateError: "update failed",
  inserted: [] as Array<{ table: string; row: unknown }>,
};

vi.mock("@/lib/data", () => ({
  listTable: vi.fn(async () => []),
  insertRow: vi.fn(async (table: string, row: unknown) => {
    if (dataState.insertShouldFail) throw new Error(dataState.insertError);
    const full = { id: "row-1", ...(row as object) };
    dataState.inserted.push({ table, row: full });
    return full;
  }),
  updateRow: vi.fn(async (_table: string, _id: string, _patch: unknown) => {
    if (dataState.updateShouldFail) throw new Error(dataState.updateError);
    return { id: "row-1" };
  }),
}));

const auditCalls: unknown[] = [];
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async (payload: unknown) => { auditCalls.push(payload); }),
}));

import { createPendingRequest, approveRequest, rejectRequest } from "./reprintPolicy";

beforeEach(() => {
  dataState.insertShouldFail = false;
  dataState.updateShouldFail = false;
  dataState.inserted = [];
  auditCalls.length = 0;
});

describe("createPendingRequest", () => {
  it("returns the persisted row and mirrors an audit entry on success", async () => {
    const row = await createPendingRequest({
      refType: "carton", refId: "ctn-1", refLabel: "CTN-1",
      parsed: { category: "Damaged label" },
    });

    expect(row.id).toBe("row-1");
    expect(dataState.inserted).toHaveLength(1);
    expect(dataState.inserted[0].table).toBe("ols_reprint_requests");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({ action: "reprint_requested", entity_id: "ctn-1" });
  });

  it("propagates the write failure instead of swallowing it and returning null", async () => {
    dataState.insertShouldFail = true;
    dataState.insertError = "Connection refused: Supabase unreachable";

    // Regression guard: the old implementation caught this internally and
    // returned null, so a caller that (like ReprintModal.tsx) doesn't check
    // the return value would report success anyway.
    await expect(
      createPendingRequest({ refType: "carton", refId: "ctn-1", refLabel: "CTN-1", parsed: { category: "Other" } })
    ).rejects.toThrow("Connection refused: Supabase unreachable");

    expect(dataState.inserted).toHaveLength(0);
    // No audit mirror should fire for a request that never durably existed.
    expect(auditCalls).toHaveLength(0);
  });
});

describe("approveRequest / rejectRequest", () => {
  const row = {
    id: "req-1", ref_type: "carton" as const, ref_id: "ctn-1",
    reason: "Damaged label", status: "pending" as const, created_at: new Date().toISOString(),
  };

  it("approveRequest mirrors to the shared audit() helper (not a silent-swallow reimplementation)", async () => {
    await approveRequest(row, "supervisor@oasisbaklawa.com", "looks fine");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({ action: "reprint_approved", entity_id: "ctn-1" });
  });

  it("rejectRequest mirrors to the shared audit() helper", async () => {
    await rejectRequest(row, "supervisor@oasisbaklawa.com", "not eligible");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({ action: "reprint_rejected", entity_id: "ctn-1" });
  });

  it("propagates updateRow failure on approve rather than silently no-op'ing", async () => {
    dataState.updateShouldFail = true;
    dataState.updateError = "RLS denied";
    await expect(approveRequest(row, "supervisor@oasisbaklawa.com")).rejects.toThrow("RLS denied");
    expect(auditCalls).toHaveLength(0);
  });
});
