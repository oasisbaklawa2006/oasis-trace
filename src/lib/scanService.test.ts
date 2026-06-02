import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  processDispatchGateCtnSoScan,
  processCartonIdentityScan,
  hasIdempotentScan,
} from "./scanService";

const orders = [
  { id: "order-uuid-1", order_number: "SO-2026-0001" },
  { id: "order-uuid-2", order_number: "SO-2026-0002" },
];

const mockState = { scanHistory: [] as any[] };

vi.mock("@/lib/data", () => ({
  listTable: vi.fn(async (table: string) => {
    if (table === "ols_scan_history") return [...mockState.scanHistory];
    return [];
  }),
  insertRow: vi.fn(async (table: string, row: any) => {
    if (table === "ols_scan_history") {
      const full = { id: crypto.randomUUID(), ...row };
      mockState.scanHistory.push(full);
      return full;
    }
    return row;
  }),
  isDuplicateError: vi.fn(),
}));

describe("processDispatchGateCtnSoScan", () => {
  beforeEach(() => {
    mockState.scanHistory = [];
  });

  it("returns dispatch_gate payload on verified scan", async () => {
    const r = await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(r.ok).toBe(true);
    expect(r.userMessage).toBe("Gate scan verified");
    expect(r.payload?.scan_type).toBe("dispatch_gate");
    expect(r.readyForCentral).toBe(true);
    expect(r.idempotencyKey).toContain("dispatch_gate");
  });

  it("returns order not found for unknown SO", async () => {
    const r = await processDispatchGateCtnSoScan("CTN-SO-2026-999999", orders);
    expect(r.ok).toBe(false);
    expect(r.userMessage).toBe("Order not found");
  });

  it("returns invalid format for PL barcode", async () => {
    const r = await processDispatchGateCtnSoScan("PL-20260101-0001", orders);
    expect(r.ok).toBe(false);
    expect(r.userMessage).toBe("Barcode format invalid");
  });

  it("blocks duplicate idempotency", async () => {
    const first = await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(first.ok).toBe(true);
    const dup = await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(dup.ok).toBe(false);
    expect(dup.duplicate).toBe(true);
    expect(dup.userMessage).toBe("Scan already recorded");
  });
});

describe("processCartonIdentityScan", () => {
  beforeEach(() => {
    mockState.scanHistory = [];
  });

  it("returns carton identity payload when order matches", async () => {
    const r = await processCartonIdentityScan("CTN-SO-2026-0002", "SO-2026-0002", orders);
    expect(r.ok).toBe(true);
    expect(r.userMessage).toBe("Carton identity verified");
    expect(r.payload?.scan_type).toBe("carton");
    expect(r.payload?.verification_type).toBe("identity_match");
  });

  it("returns wrong carton for mismatched order", async () => {
    const r = await processCartonIdentityScan("CTN-SO-2026-0002", "SO-2026-0001", orders);
    expect(r.ok).toBe(false);
    expect(r.userMessage).toBe("Wrong carton for this order");
  });

  it("blocks duplicate carton identity scans", async () => {
    const first = await processCartonIdentityScan("CTN-SO-2026-0001", "SO-2026-0001", orders);
    expect(first.ok).toBe(true);
    const dup = await processCartonIdentityScan("CTN-SO-2026-0001", "SO-2026-0001", orders);
    expect(dup.duplicate).toBe(true);
    expect(dup.userMessage).toBe("Scan already recorded");
  });
});

describe("hasIdempotentScan", () => {
  beforeEach(() => {
    mockState.scanHistory = [];
  });

  it("detects existing keys after insert", async () => {
    await processDispatchGateCtnSoScan("CTN-SO-2026-0002", orders);
    const key = "barcode_app|dispatch_gate|CTN-SO-2026-0002|order-uuid-2";
    expect(await hasIdempotentScan(key)).toBe(true);
  });
});
