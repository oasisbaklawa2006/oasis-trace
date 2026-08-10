// Safety-critical: this is the only guard against accidental rapid
// double-prints (double-click, scanner re-fire, retry). It is intentionally
// client-side/in-memory + sessionStorage, so these tests exercise the real
// timing behavior rather than mocking it away.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { isLocked, acquireLock, releaseLock, checkRecent, markPrinted, guardPrint } from "./printLock";

beforeEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("hard lock", () => {
  it("is not locked before acquisition", () => {
    expect(isLocked("production_label", "A")).toBe(false);
  });

  it("acquireLock succeeds once and blocks a second immediate acquisition for the same ref", () => {
    expect(acquireLock("production_label", "A")).toBe(true);
    expect(isLocked("production_label", "A")).toBe(true);
    expect(acquireLock("production_label", "A")).toBe(false);
  });

  it("expires the hard lock after its duration elapses", async () => {
    vi.useFakeTimers();
    acquireLock("production_label", "expiring-ref", 100);
    expect(isLocked("production_label", "expiring-ref")).toBe(true);
    vi.advanceTimersByTime(101);
    expect(isLocked("production_label", "expiring-ref")).toBe(false);
    expect(acquireLock("production_label", "expiring-ref", 100)).toBe(true);
    vi.useRealTimers();
  });

  it("releaseLock frees the ref immediately, before natural expiry", () => {
    acquireLock("carton", "B", 5000);
    expect(isLocked("carton", "B")).toBe(true);
    releaseLock("carton", "B");
    expect(isLocked("carton", "B")).toBe(false);
  });
});

describe("independent references", () => {
  it("locking one ref does not lock a different ref, or a different refType with the same id", () => {
    acquireLock("production_label", "A");
    expect(isLocked("production_label", "B")).toBe(false);
    expect(isLocked("carton", "A")).toBe(false);
  });
});

describe("recent-print soft warning", () => {
  it("checkRecent reports not-recent before any print", () => {
    const r = checkRecent("shipping", "S1");
    expect(r.recent).toBe(false);
    expect(r.count).toBe(0);
  });

  it("markPrinted makes checkRecent report recent with count 1, then increments on repeat", () => {
    markPrinted("shipping", "S1");
    expect(checkRecent("shipping", "S1")).toMatchObject({ recent: true, count: 1 });
    markPrinted("shipping", "S1");
    expect(checkRecent("shipping", "S1")).toMatchObject({ recent: true, count: 2 });
  });

  it("stops reporting recent once RECENT_MS (60s) has elapsed", () => {
    vi.useFakeTimers();
    markPrinted("shipping", "S1");
    expect(checkRecent("shipping", "S1").recent).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(checkRecent("shipping", "S1").recent).toBe(false);
    vi.useRealTimers();
  });
});

describe("guardPrint — one-shot inline guard", () => {
  it("returns ok:true and lets confirm()/release() run without throwing on a fresh ref", () => {
    const guard = guardPrint("production_label", "fresh-ref");
    expect(guard.ok).toBe(true);
    if (guard.ok) {
      expect(isLocked("production_label", "fresh-ref")).toBe(true);
      guard.confirm();
      guard.release();
      expect(isLocked("production_label", "fresh-ref")).toBe(false);
    }
  });

  it("returns ok:false while the hard lock is held (rapid double-fire)", () => {
    const first = guardPrint("production_label", "dup-ref");
    expect(first.ok).toBe(true);
    const second = guardPrint("production_label", "dup-ref");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toMatch(/already printing/i);
  });

  it("blocks (does not just warn) a recent-but-unlocked print when blockOnRecent is set", () => {
    const first = guardPrint("production_label", "recent-ref");
    if (first.ok) { first.confirm(); first.release(); }
    const second = guardPrint("production_label", "recent-ref", { blockOnRecent: true });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toMatch(/duplicate blocked/i);
  });

  it("without blockOnRecent, a recent-but-unlocked print is allowed through with a warning surfaced", () => {
    const first = guardPrint("production_label", "warn-ref");
    if (first.ok) { first.confirm(); first.release(); }
    const second = guardPrint("production_label", "warn-ref");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.warning).toMatch(/continue\?/i);
  });
});
