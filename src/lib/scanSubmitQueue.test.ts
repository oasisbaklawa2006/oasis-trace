import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  enqueuePendingScan,
  flushScanSubmitQueue,
  getPendingScans,
  getPermanentFailures,
  getRetryableQueueSize,
  isPermanentSubmitFailure,
  removePendingScan,
  submitWithOfflineRetry,
} from "./scanSubmitQueue";

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

const submitMock = vi.fn();

vi.mock("@/lib/data", () => ({
  isOnline: vi.fn(() => true),
  subscribeOnline: vi.fn(() => () => {}),
}));

vi.mock("@/lib/centralSubmit", () => ({
  submitCentralScan: (...args: unknown[]) => submitMock(...args),
}));

import { isOnline } from "@/lib/data";

describe("isPermanentSubmitFailure", () => {
  it("classifies authority rejections as permanent", () => {
    expect(isPermanentSubmitFailure("forbidden")).toBe(true);
    expect(isPermanentSubmitFailure("not_verified")).toBe(true);
    expect(isPermanentSubmitFailure("unauthenticated")).toBe(true);
  });

  it("does not classify network errors as permanent", () => {
    expect(isPermanentSubmitFailure("network_error")).toBe(false);
    expect(isPermanentSubmitFailure(undefined)).toBe(false);
  });
});

describe("scanSubmitQueue", () => {
  beforeEach(() => {
    localStorage.clear();
    submitMock.mockReset();
    vi.mocked(isOnline).mockReturnValue(true);
    vi.stubEnv("VITE_CENTRAL_SCAN_SUBMIT_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offline enqueue persists envelope with deterministic idempotency key", async () => {
    vi.mocked(isOnline).mockReturnValue(false);

    const r = await submitWithOfflineRetry({
      idempotencyKey: "barcode_app|dispatch_gate|CTN-SO-2026-0001|order-1",
      payload: dispatchPayload,
      scanHistoryId: "hist-1",
      session,
    });

    expect(r.queued).toBe(true);
    expect(r.status).toBe("retry_pending");
    expect(submitMock).not.toHaveBeenCalled();

    const pending = getPendingScans();
    expect(pending).toHaveLength(1);
    expect(pending[0].idempotencyKey).toBe("barcode_app|dispatch_gate|CTN-SO-2026-0001|order-1");
    expect(pending[0].payload).toEqual(dispatchPayload);
    expect(pending[0].scanHistoryId).toBe("hist-1");
  });

  it("reconnect replay drains queue on flush", async () => {
    enqueuePendingScan({
      idempotencyKey: "k-reconnect",
      payload: dispatchPayload,
      scanHistoryId: "hist-2",
      session,
    });

    submitMock.mockResolvedValueOnce({
      ok: true,
      status: "submitted",
      message: "Submitted to Central",
      centralReference: "CENTRAL-1",
    });

    const result = await flushScanSubmitQueue(session);
    expect(result.ok).toBe(1);
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(getRetryableQueueSize()).toBe(0);
  });

  it("duplicate retry removes pending item without re-submitting success", async () => {
    enqueuePendingScan({
      idempotencyKey: "k-dup",
      payload: dispatchPayload,
      session,
    });

    submitMock.mockResolvedValueOnce({
      ok: false,
      duplicate: true,
      status: "submitted",
      message: "Scan already recorded",
    });

    const result = await flushScanSubmitQueue(session);
    expect(result.ok).toBe(1);
    expect(getPendingScans()).toHaveLength(0);
  });

  it("reload recovery restores queue from localStorage", () => {
    enqueuePendingScan({
      idempotencyKey: "k-reload",
      payload: dispatchPayload,
      scanHistoryId: "hist-3",
      session,
    });

    const stored = localStorage.getItem("ols_scan_submit_queue");
    expect(stored).toBeTruthy();

    localStorage.setItem("ols_scan_submit_queue", stored!);
    const restored = getPendingScans();
    expect(restored).toHaveLength(1);
    expect(restored[0].idempotencyKey).toBe("k-reload");
  });

  it("permanent rejection is visible and not retried", async () => {
    enqueuePendingScan({
      idempotencyKey: "k-perm",
      payload: dispatchPayload,
      session,
    });

    submitMock.mockResolvedValueOnce({
      ok: false,
      status: "failed",
      message: "Dispatch or security role required",
      failureReason: "forbidden",
    });

    const flush1 = await flushScanSubmitQueue(session);
    expect(flush1.permanent).toBe(1);
    expect(getRetryableQueueSize()).toBe(0);

    const failures = getPermanentFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].failureReason).toBe("forbidden");
    expect(failures[0].permanentFailure).toBe(true);

    submitMock.mockClear();
    const flush2 = await flushScanSubmitQueue(session);
    expect(flush2.skipped).toBe(0);
    expect(flush2.permanent).toBe(1);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("successful queue drain processes FIFO and empties retryable queue", async () => {
    enqueuePendingScan({
      idempotencyKey: "k-a",
      payload: dispatchPayload,
      session,
    });
    enqueuePendingScan({
      idempotencyKey: "k-b",
      payload: { ...dispatchPayload, order_id: "order-2" },
      session,
    });

    submitMock
      .mockResolvedValueOnce({ ok: true, status: "submitted", message: "ok-a" })
      .mockResolvedValueOnce({ ok: true, status: "submitted", message: "ok-b" });

    const result = await flushScanSubmitQueue(session);
    expect(result.ok).toBe(2);
    expect(getRetryableQueueSize()).toBe(0);
    expect(submitMock.mock.calls[0][0].idempotencyKey).toBe("k-a");
    expect(submitMock.mock.calls[1][0].idempotencyKey).toBe("k-b");
  });

  it("transient failure keeps item queued for a later flush", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    submitMock.mockResolvedValueOnce({
      ok: false,
      status: "failed",
      message: "Edge function error",
      failureReason: "edge_timeout",
    });

    const r = await submitWithOfflineRetry({
      idempotencyKey: "k-transient",
      payload: dispatchPayload,
      session,
    });

    expect(r.queued).toBe(true);
    expect(getRetryableQueueSize()).toBe(1);

    vi.advanceTimersByTime(5_000);

    submitMock.mockResolvedValueOnce({
      ok: true,
      status: "submitted",
      message: "Submitted",
    });

    const flush = await flushScanSubmitQueue(session);
    expect(flush.ok).toBe(1);
    expect(getRetryableQueueSize()).toBe(0);

    vi.useRealTimers();
  });

  it("removePendingScan drops acknowledged envelope", () => {
    enqueuePendingScan({
      idempotencyKey: "k-remove",
      payload: dispatchPayload,
      session,
    });
    expect(getPendingScans()).toHaveLength(1);
    removePendingScan("k-remove");
    expect(getPendingScans()).toHaveLength(0);
  });
});
