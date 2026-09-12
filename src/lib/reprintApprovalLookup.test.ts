/**
 * PR #38 finding A (CodeRabbit Major): findReusableApprovedRequest previously
 * used listTable(), which falls back to the local demo store when a
 * configured-live read fails. That made a live read failure indistinguishable
 * from "no approved request exists" — ReprintModal.confirmLive would then
 * create a new pending request and obtain a new Core reprint-count
 * allocation for a reprint that was already approved. This file proves the
 * live-only replacement fails closed instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  configured: true,
  requests: [] as Array<Record<string, unknown>>,
  requestsError: null as { message: string } | null,
  logs: [] as Array<Record<string, unknown>>,
  logsError: null as { message: string } | null,
};

interface FakeResult {
  data: Array<Record<string, unknown>>;
  error: { message: string } | null;
}

interface FakeBuilder extends PromiseLike<FakeResult> {
  select: () => FakeBuilder;
  eq: () => FakeBuilder;
}

function builder(table: string): FakeBuilder {
  const result: FakeResult = table === "ols_reprint_requests"
    ? { data: state.requests, error: state.requestsError }
    : { data: state.logs, error: state.logsError };
  const b: FakeBuilder = {
    select: () => b,
    eq: () => b,
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return b;
}

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() { return state.configured; },
  get supabase() {
    return state.configured ? { from: (table: string) => builder(table) } : null;
  },
}));

import { findReusableApprovedRequestLive } from "./reprintApprovalLookup";

beforeEach(() => {
  state.configured = true;
  state.requests = [];
  state.requestsError = null;
  state.logs = [];
  state.logsError = null;
});

describe("findReusableApprovedRequestLive", () => {
  it("returns null when there is no approved request to reuse", async () => {
    const result = await findReusableApprovedRequestLive("carton", "ctn-1");
    expect(result).toBeNull();
  });

  it("reuses an approved request that has not yet been consumed by a successful reprint log", async () => {
    state.requests = [
      { id: "req-1", ref_type: "carton", ref_id: "ctn-1", status: "approved", approved_by: "user-1", created_at: "2026-01-01T00:00:00Z" },
    ];
    const result = await findReusableApprovedRequestLive("carton", "ctn-1");
    expect(result?.id).toBe("req-1");
  });

  it("does not reuse an approved request already consumed by a successful reprint log", async () => {
    state.requests = [
      { id: "req-1", ref_type: "carton", ref_id: "ctn-1", status: "approved", approved_by: "user-1", created_at: "2026-01-01T00:00:00Z" },
    ];
    state.logs = [
      { ref_type: "carton", ref_id: "ctn-1", is_reprint: true, success: true, reason: "base=command_generated|request=req-1" },
    ];
    const result = await findReusableApprovedRequestLive("carton", "ctn-1");
    expect(result).toBeNull();
  });

  it("fails closed when the live reprint-requests read fails, instead of behaving as if none exists", async () => {
    state.requestsError = { message: "RLS denied" };
    await expect(findReusableApprovedRequestLive("carton", "ctn-1")).rejects.toThrow(/RLS denied/);
  });

  it("fails closed when the live print-logs read fails", async () => {
    state.logsError = { message: "network error" };
    await expect(findReusableApprovedRequestLive("carton", "ctn-1")).rejects.toThrow(/network error/);
  });

  it("throws instead of silently using demo semantics when Supabase is not configured", async () => {
    state.configured = false;
    await expect(findReusableApprovedRequestLive("carton", "ctn-1")).rejects.toThrow(/configured Supabase/);
  });
});
