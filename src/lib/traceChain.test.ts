// Genuine end-to-end chain integration test: builds a full
// Production -> Label -> Stock -> Carton -> DPL -> Finance PI ->
// Shipping Label -> Gate Scan record set (mirroring what the real pages
// insert), then asserts resolveTraceChain() walks it via real FKs.
//
// This specifically guards two Phase 0.5 findings this Wave fixed:
//   1. PI -> DPL must resolve via the real `dpl_id` FK when it was
//      populated at PI-creation time (FinancePI.tsx), not silently fall
//      back to the order_ref heuristic when a real FK target exists.
//   2. The Central CTN-SO gate path (scanService.ts) populates
//      shipping_label_id when unambiguous.
import { describe, it, expect } from "vitest";
import { resolveTraceChain, type TraceChainData } from "./traceChain";
import type { SearchDoc } from "./traceSearch";

function buildSeededChain(): TraceChainData {
  return {
    labels: [{
      id: "label-1", label_no: "PL-20260511-9303", batch_id: "batch-1", product_id: "prod-1",
      net_weight: 5, status: "active", metadata: { sku: "CPB-5000", product_name: "Cashew Pyramid Baklawa" },
    }],
    cartons: [{
      id: "carton-1", carton_no: "CTN-20260511-6757", order_ref: "SO-2026-0001",
      customer_name: "Al Manzil Trading", status: "packed",
    }],
    contents: [{ id: "cc-1", carton_id: "carton-1", production_label_id: "label-1" }],
    // PI created with dpl_id populated at creation time via the real
    // ols_dpl_cartons FK (FinancePI.tsx's scanCarton fix) — NOT via order_ref.
    pis: [{ id: "pi-1", pi_no: "PI-20260511-205", dpl_id: "dpl-1", order_ref: "SO-2026-0001", status: "cleared" }],
    shipping: [{ id: "ship-1", shipping_no: "SHP-20260511-7665", carton_id: "carton-1", pi_id: "pi-1", qr_ref: "QR-ABC123" }],
    movements: [{ id: "mv-1", production_label_id: "label-1", from_location: "production", to_location: "store", movement_type: "production_inward" }],
    dpls: [{ id: "dpl-1", dpl_no: "DPL-20260511-865", order_ref: "SO-2026-0001", total_cartons: 1 }],
    gateScans: [{ id: "gate-1", qr_ref: "CTN-SO-2026-0001", shipping_label_id: "ship-1", result: "green" }],
  };
}

describe("resolveTraceChain — full seeded chain, starting from the production label", () => {
  const data = buildSeededChain();
  const chosen: SearchDoc = { kind: "production_label", id: "label-1", ref: "PL-20260511-9303", label: "PL-20260511-9303", keywords: [], raw: data.labels[0] };

  it("resolves every downstream node via FK, not fallback", () => {
    const chain = resolveTraceChain(chosen, data);
    expect(chain.label?.id).toBe("label-1");
    expect(chain.carton?.id).toBe("carton-1");
    expect(chain.ship?.id).toBe("ship-1");
    expect(chain.pi?.id).toBe("pi-1");
    expect(chain.dpl?.id).toBe("dpl-1");
    expect(chain.gate?.id).toBe("gate-1");
    expect(chain.labelMovements).toHaveLength(1);
  });

  it("resolves PI -> DPL via the real dpl_id FK, not the order_ref fallback", () => {
    // Prove this isn't accidentally passing via order_ref by seeding a
    // SECOND, decoy DPL that also matches order_ref — if the resolver ever
    // regresses to checking order_ref before dpl_id, it could pick the
    // wrong one (or the right one for the wrong reason). The dpl_id FK
    // must win.
    const decoyData: TraceChainData = {
      ...data,
      dpls: [
        { id: "dpl-1", dpl_no: "DPL-20260511-865", order_ref: "SO-2026-0001", total_cartons: 1 },
        { id: "dpl-DECOY", dpl_no: "DPL-DECOY", order_ref: "SO-2026-0001", total_cartons: 1 },
      ],
    };
    const chain = resolveTraceChain(chosen, decoyData);
    expect(chain.dpl?.id).toBe("dpl-1");
    expect(chain.dpl?.id).not.toBe("dpl-DECOY");
  });

  it("falls back to order_ref only when dpl_id was never populated on the PI", () => {
    const legacyData: TraceChainData = {
      ...data,
      pis: [{ id: "pi-1", pi_no: "PI-20260511-205", order_ref: "SO-2026-0001", status: "cleared" }], // no dpl_id
    };
    const chain = resolveTraceChain(chosen, legacyData);
    expect(chain.dpl?.id).toBe("dpl-1"); // still resolves, via the order_ref fallback
  });
});

describe("resolveTraceChain — Central CTN-SO gate scan path", () => {
  it("resolves the shipping/carton/DPL chain from a gate_scan entity via shipping_label_id FK", () => {
    const data = buildSeededChain();
    const chosen: SearchDoc = { kind: "gate_scan", id: "gate-1", ref: "CTN-SO-2026-0001", label: "Gate GREEN", keywords: [], raw: data.gateScans[0] };
    const chain = resolveTraceChain(chosen, data);
    expect(chain.ship?.id).toBe("ship-1");
    expect(chain.carton?.id).toBe("carton-1");
    expect(chain.pi?.id).toBe("pi-1");
    expect(chain.dpl?.id).toBe("dpl-1");
  });

  it("does not resolve a gate scan whose shipping_label_id was left null (ambiguous order, honestly unresolved)", () => {
    const data = buildSeededChain();
    data.gateScans[0].shipping_label_id = undefined; // scanService.ts's honest "don't guess" outcome
    const chosen: SearchDoc = { kind: "gate_scan", id: "gate-1", ref: "CTN-SO-2026-0001", label: "Gate GREEN", keywords: [], raw: data.gateScans[0] };
    const chain = resolveTraceChain(chosen, data);
    expect(chain.ship).toBeUndefined();
    expect(chain.carton).toBeUndefined();
  });
});

describe("resolveTraceChain — unresolved chain stays honestly empty", () => {
  it("returns no downstream nodes for a label with no movements/carton/etc", () => {
    const data: TraceChainData = { labels: [{ id: "label-orphan", label_no: "PL-ORPHAN", status: "active" }], cartons: [], contents: [], pis: [], shipping: [], movements: [], dpls: [], gateScans: [] };
    const chosen: SearchDoc = { kind: "production_label", id: "label-orphan", ref: "PL-ORPHAN", label: "PL-ORPHAN", keywords: [], raw: data.labels[0] };
    const chain = resolveTraceChain(chosen, data);
    expect(chain.carton).toBeUndefined();
    expect(chain.pi).toBeUndefined();
    expect(chain.dpl).toBeUndefined();
    expect(chain.ship).toBeUndefined();
    expect(chain.gate).toBeUndefined();
    expect(chain.labelMovements).toHaveLength(0);
  });
});
