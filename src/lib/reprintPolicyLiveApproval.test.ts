/**
 * Live-mode regression coverage for approveRequest() against the Core RPC
 * trace_approve_reprint_request_v1 (Core PR #300, merged into
 * oasis-supabase-core main at 4e8374e). reprintPolicy.test.ts only exercises
 * the demo-mode (supabaseConfigured=false) path; this file covers the
 * live-mode path that reaches Core, including idempotent replay and
 * malformed-response rejection — regressions the demo-mode mocks can't catch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeTraceMutation } = vi.hoisted(() => ({ invokeTraceMutation: vi.fn() }));

vi.mock("@/lib/data", () => ({
  listTable: vi.fn(async () => []),
  insertRow: vi.fn(),
  updateRow: vi.fn(),
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: {} }));

const auditCalls: unknown[] = [];
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async (payload: unknown) => { auditCalls.push(payload); }),
}));

import { approveRequest, type ReprintRow } from "./reprintPolicy";

const row: ReprintRow = {
  id: "req-1",
  ref_type: "carton",
  ref_id: "ctn-1",
  reason: "Damaged label",
  status: "pending",
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  invokeTraceMutation.mockReset();
  auditCalls.length = 0;
});

describe("approveRequest — live mode delegates to Core RPC trace_approve_reprint_request_v1", () => {
  it("throws before calling Core when no authenticated approver identity is supplied", async () => {
    await expect(approveRequest(row, "supervisor@oasisbaklawa.com")).rejects.toThrow(
      "Authenticated approver identity is required in live mode",
    );
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });

  it("calls Core with the request id and a request-scoped idempotency key", async () => {
    invokeTraceMutation.mockResolvedValue({
      request_id: "req-1",
      status: "approved",
      approved_by: "approver-uuid",
      idempotency_replayed: false,
    });

    await approveRequest(row, "supervisor@oasisbaklawa.com", undefined, "approver-uuid");

    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_approve_reprint_request_v1", {
      p_request_id: "req-1",
      p_idempotency_key: "trace-reprint-approve:req-1",
    });
  });

  it("returns the parsed reason with approver/remarks merged on a valid Core response", async () => {
    invokeTraceMutation.mockResolvedValue({
      request_id: "req-1",
      status: "approved",
      approved_by: "approver-uuid",
      idempotency_replayed: false,
    });

    const parsed = await approveRequest(row, "supervisor@oasisbaklawa.com", "looks fine", "approver-uuid");

    expect(parsed.approver).toBe("supervisor@oasisbaklawa.com");
    expect(parsed.remarks).toBe("looks fine");
  });

  it("succeeds on an idempotent replay (idempotency_replayed: true)", async () => {
    invokeTraceMutation.mockResolvedValue({
      request_id: "req-1",
      status: "approved",
      approved_by: "approver-uuid",
      idempotency_replayed: true,
    });

    await expect(
      approveRequest(row, "supervisor@oasisbaklawa.com", undefined, "approver-uuid"),
    ).resolves.toBeTruthy();
  });

  it("propagates a Core authorization/state rejection (e.g. NOT_AUTHORIZED) instead of swallowing it", async () => {
    invokeTraceMutation.mockRejectedValue(new Error("NOT_AUTHORIZED: Trace reprint approval authority required"));

    await expect(
      approveRequest(row, "supervisor@oasisbaklawa.com", undefined, "approver-uuid"),
    ).rejects.toThrow("NOT_AUTHORIZED");
  });

  it.each([
    ["mismatched request_id", { request_id: "req-OTHER", status: "approved", approved_by: "x", idempotency_replayed: false }],
    ["wrong status", { request_id: "req-1", status: "pending", approved_by: "x", idempotency_replayed: false }],
    ["missing approved_by", { request_id: "req-1", status: "approved", approved_by: "", idempotency_replayed: false }],
    ["non-boolean idempotency_replayed", { request_id: "req-1", status: "approved", approved_by: "x", idempotency_replayed: "false" }],
    ["null response", null],
  ])("rejects a malformed Core response: %s", async (_label, response) => {
    invokeTraceMutation.mockResolvedValue(response);
    await expect(
      approveRequest(row, "supervisor@oasisbaklawa.com", undefined, "approver-uuid"),
    ).rejects.toThrow("Core returned an invalid reprint approval response");
  });

  it("does not issue a client-side audit() mirror — Core writes its own audit row atomically", async () => {
    invokeTraceMutation.mockResolvedValue({
      request_id: "req-1",
      status: "approved",
      approved_by: "approver-uuid",
      idempotency_replayed: false,
    });

    await approveRequest(row, "supervisor@oasisbaklawa.com", undefined, "approver-uuid");

    expect(auditCalls).toHaveLength(0);
  });
});
