import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { submitCentralScan, retryCentralScan } from "./centralSubmit";
import type { Session } from "@supabase/supabase-js";

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: false,
  supabase: null,
}));

vi.mock("@/lib/data", () => ({
  listTable: vi.fn(async () => []),
  updateRow: vi.fn(async () => ({})),
}));

const dispatchPayload = {
  source_app: "barcode_app",
  order_id: "order-1",
  order_number: "SO-2026-0001",
  scan_type: "dispatch_gate",
  verification_type: "gate_check",
  entity_type: "order",
  barcode_value: "CTN-SO-2026-0001",
  expected_barcode: "CTN-SO-2026-0001",
  verification_status: "verified",
  scan_source: "barcode_app_gate_scan",
};

const session = {
  user: { id: "u1", app_metadata: { ols_roles: ["dispatch"] } },
} as unknown as Session;

describe("submitCentralScan", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_CENTRAL_SCAN_SUBMIT_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks unauthenticated submit", async () => {
    const r = await submitCentralScan({
      idempotencyKey: "k1",
      payload: dispatchPayload,
      session: null,
    });
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("unauthenticated");
  });

  it("blocks without dispatch/security role", async () => {
    const r = await submitCentralScan({
      idempotencyKey: "k2",
      payload: dispatchPayload,
      session: { user: { id: "u2", app_metadata: { ols_roles: ["production"] } } } as unknown as Session,
    });
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("forbidden");
  });

  it("blocks non-verified payload", async () => {
    const r = await submitCentralScan({
      idempotencyKey: "k3",
      payload: { ...dispatchPayload, verification_status: "mismatch" },
      session,
    });
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("not_verified");
  });

  it("submits successfully in mock mode", async () => {
    const r = await submitCentralScan({
      idempotencyKey: "k4",
      payload: dispatchPayload,
      session,
      scanHistoryId: "hist-1",
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("submitted");
    expect(r.centralReference).toMatch(/^MOCK-CENTRAL-/);
  });

  it("blocks duplicate submit", async () => {
    await submitCentralScan({ idempotencyKey: "k5", payload: dispatchPayload, session });
    const dup = await submitCentralScan({ idempotencyKey: "k5", payload: dispatchPayload, session });
    expect(dup.duplicate).toBe(true);
    expect(dup.message).toBe("Scan already recorded");
  });

  it("retry after mock failure path uses same key", async () => {
    const first = await submitCentralScan({
      idempotencyKey: "k6",
      payload: dispatchPayload,
      session,
    });
    expect(first.ok).toBe(true);
    const retry = await retryCentralScan({
      idempotencyKey: "k6",
      payload: dispatchPayload,
      session,
    });
    expect(retry.duplicate).toBe(true);
  });
});
