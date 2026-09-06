import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  processDispatchGateCtnSoScan,
  processCartonIdentityScan,
  deterministicScanHistoryId,
} from "./scanService";
import { scanIdempotencyKey } from "./scanContract";

const CENTRAL_ORDER_1 = "550e8400-e29b-41d4-a716-446655440001";
const CENTRAL_ORDER_2 = "550e8400-e29b-41d4-a716-446655440002";

const orders = [
  { id: "order-uuid-1", order_number: "SO-2026-0001", external_ref: CENTRAL_ORDER_1 },
  { id: "order-uuid-2", order_number: "SO-2026-0002", external_ref: CENTRAL_ORDER_2 },
];

const mockState = { scanHistory: [] as Record<string, unknown>[], gateScans: [] as Record<string, unknown>[] };
const insertedScanHistoryIds = new Set<string>();

vi.mock("@/lib/data", () => ({
  listTable: vi.fn(async (table: string) => {
    if (table === "ols_scan_history") return [...mockState.scanHistory];
    return [];
  }),
  insertRow: vi.fn(async (table: string, row: Record<string, unknown>) => {
    if (table === "ols_scan_history") {
      await new Promise(r => setTimeout(r, 0));
      const id = row.id as string;
      if (!id || insertedScanHistoryIds.has(id)) {
        const err = Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
        });
        throw err;
      }
      insertedScanHistoryIds.add(id);
      const full = { ...row };
      mockState.scanHistory.push(full);
      return full;
    }
    if (table === "ols_gate_scans") {
      const full = { id: crypto.randomUUID(), ...row };
      mockState.gateScans.push(full);
      return full;
    }
    return row;
  }),
  isDuplicateError: (err: unknown) => {
    const e = err as { code?: string; message?: string } | undefined;
    return e?.code === "23505" || /duplicate key value/i.test(e?.message || "");
  },
}));

function resetScanHistoryMocks() {
  mockState.scanHistory = [];
  mockState.gateScans = [];
  insertedScanHistoryIds.clear();
}

describe("processDispatchGateCtnSoScan", () => {
  beforeEach(() => {
    resetScanHistoryMocks();
  });

  it("returns dispatch_gate payload on verified scan", async () => {
    const r = await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(r.ok).toBe(true);
    expect(r.userMessage).toBe("Gate scan verified");
    expect(r.payload?.scan_type).toBe("dispatch_gate");
    expect(r.readyForCentral).toBe(true);
    expect(r.idempotencyKey).toContain("dispatch_gate");
    expect(r.idempotencyKey).toContain(CENTRAL_ORDER_1);
    expect(r.payload?.contract_version).toBe("1.0");
    expect(r.payload?.order_id).toBe(CENTRAL_ORDER_1);
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

  it("returns preview_only when order lacks Central external_ref binding", async () => {
    const unbound = [{ id: "local-only", order_number: "SO-2026-0003" }];
    const r = await processDispatchGateCtnSoScan("CTN-SO-2026-0003", unbound);
    expect(r.ok).toBe(true);
    expect(r.readyForCentral).toBe(false);
    expect(r.messageCode).toBe("central_order_unbound");
    expect(r.centralSyncStatus).toBe("preview_only");
  });

  it("deduplicates repeated unbound dispatch preview scans", async () => {
    const unbound = [{ id: "local-only", order_number: "SO-2026-0003" }];
    const first = await processDispatchGateCtnSoScan("CTN-SO-2026-0003", unbound);
    expect(first.ok).toBe(true);
    expect(mockState.scanHistory).toHaveLength(1);

    const duplicate = await processDispatchGateCtnSoScan("CTN-SO-2026-0003", unbound);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.messageCode).toBe("scan_already_recorded");
    expect(mockState.scanHistory).toHaveLength(1);
  });

  it("blocks duplicate idempotency", async () => {
    const first = await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(first.ok).toBe(true);
    const dup = await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(dup.ok).toBe(false);
    expect(dup.duplicate).toBe(true);
    expect(dup.userMessage).toBe("Scan already recorded");
  });

  it("leaves shipping_label_id unset when no resolution context is given", async () => {
    await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(mockState.gateScans).toHaveLength(1);
    expect(mockState.gateScans[0].shipping_label_id).toBeUndefined();
  });

  it("resolves shipping_label_id when the order has exactly one shipping label (real FK, not a guess)", async () => {
    const ctx = {
      cartons: [{ id: "carton-1", order_ref: "SO-2026-0001" }],
      shippingLabels: [{ id: "ship-1", carton_id: "carton-1" }],
    };
    await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders, ctx);
    expect(mockState.gateScans[0].shipping_label_id).toBe("ship-1");
  });

  it("leaves shipping_label_id unset (never guesses) when the order has multiple shipping labels", async () => {
    const ctx = {
      cartons: [
        { id: "carton-1", order_ref: "SO-2026-0001" },
        { id: "carton-2", order_ref: "SO-2026-0001" },
      ],
      shippingLabels: [
        { id: "ship-1", carton_id: "carton-1" },
        { id: "ship-2", carton_id: "carton-2" },
      ],
    };
    await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders, ctx);
    expect(mockState.gateScans[0].shipping_label_id).toBeUndefined();
  });

  it("leaves shipping_label_id unset when the order has no shipping labels yet", async () => {
    const ctx = { cartons: [{ id: "carton-1", order_ref: "SO-2026-0001" }], shippingLabels: [] };
    await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders, ctx);
    expect(mockState.gateScans[0].shipping_label_id).toBeUndefined();
  });
});

describe("processCartonIdentityScan", () => {
  beforeEach(() => {
    resetScanHistoryMocks();
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

  it("deduplicates repeated unbound carton preview scans", async () => {
    const unbound = [{ id: "local-only", order_number: "SO-2026-0003" }];
    const first = await processCartonIdentityScan(
      "CTN-SO-2026-0003",
      "SO-2026-0003",
      unbound,
    );
    expect(first.ok).toBe(true);
    expect(first.centralSyncStatus).toBe("preview_only");
    expect(mockState.scanHistory).toHaveLength(1);

    const duplicate = await processCartonIdentityScan(
      "CTN-SO-2026-0003",
      "SO-2026-0003",
      unbound,
    );
    expect(duplicate.ok).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.messageCode).toBe("scan_already_recorded");
    expect(mockState.scanHistory).toHaveLength(1);
  });
});

describe("atomic scan idempotency", () => {
  beforeEach(() => {
    resetScanHistoryMocks();
  });

  it("records exactly one row when two concurrent dispatch scans share the same key", async () => {
    const [first, second] = await Promise.all([
      processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders),
      processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders),
    ]);
    const successes = [first, second].filter(r => r.ok && !r.duplicate);
    const duplicates = [first, second].filter(r => r.duplicate);
    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].messageCode).toBe("scan_already_recorded");
    expect(mockState.scanHistory).toHaveLength(1);
  });

  it("records exactly one row when two concurrent carton scans share the same key", async () => {
    const [first, second] = await Promise.all([
      processCartonIdentityScan("CTN-SO-2026-0002", "SO-2026-0002", orders),
      processCartonIdentityScan("CTN-SO-2026-0002", "SO-2026-0002", orders),
    ]);
    const successes = [first, second].filter(r => r.ok && !r.duplicate);
    const duplicates = [first, second].filter(r => r.duplicate);
    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(mockState.scanHistory).toHaveLength(1);
  });

  it("deduplicates without depending on a bounded history read window", async () => {
    const idempotencyKey = scanIdempotencyKey("dispatch_gate", "CTN-SO-2026-0001", CENTRAL_ORDER_1);
    const existingId = await deterministicScanHistoryId(idempotencyKey);
    for (let i = 0; i < 1001; i++) {
      mockState.scanHistory.push({
        id: crypto.randomUUID(),
        scan_value: `FILLER-${i}`,
        metadata: { central_idempotency_key: `filler-key-${i}` },
      });
    }
    mockState.scanHistory.push({
      id: existingId,
      scan_value: "CTN-SO-2026-0001",
      metadata: { central_idempotency_key: idempotencyKey },
    });
    insertedScanHistoryIds.add(existingId);

    const dup = await processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders);
    expect(dup.ok).toBe(false);
    expect(dup.duplicate).toBe(true);
    expect(dup.messageCode).toBe("scan_already_recorded");
    expect(mockState.scanHistory).toHaveLength(1002);
  });

  it("does not treat unrelated insert failures as scan_already_recorded", async () => {
    const { insertRow } = await import("@/lib/data");
    vi.mocked(insertRow).mockImplementationOnce(async () => {
      throw new Error("network timeout");
    });
    await expect(processDispatchGateCtnSoScan("CTN-SO-2026-0001", orders)).rejects.toThrow(
      "network timeout",
    );
  });
});
