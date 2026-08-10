// Safety-critical: this is the exact green/red/hold/duplicate decision
// chain the exit-gate security officer sees. Extracted from GateScan.tsx's
// checkLegacyShipping so it can be tested as pure logic, independent of the
// side effects (DB writes, audit log) that only fire on a green result.
import { describe, it, expect } from "vitest";
import { resolveLegacyGateDecision, type LegacyGateEntities } from "./scanService";

const baseEntities: LegacyGateEntities = {
  shippingLabels: [{ id: "ship-1", qr_ref: "QR-ABC", shipping_no: "SHP-001", carton_id: "carton-1", pi_id: "pi-1", status: "generated" }],
  cartons: [{ id: "carton-1", carton_no: "CTN-001", status: "shipping_labelled" }],
  pis: [{ id: "pi-1", status: "cleared", invoice_ref: "INV-001" }],
};

describe("resolveLegacyGateDecision — GREEN (allowed)", () => {
  it("allows a fully-cleared, non-dispatched carton through by QR ref", () => {
    const { result, label, carton } = resolveLegacyGateDecision("QR-ABC", baseEntities);
    expect(result).toMatchObject({ kind: "green", title: "ALLOWED", ref: "CTN-001" });
    // GateScan.tsx only persists the dispatch update when both are present.
    expect(label?.id).toBe("ship-1");
    expect(carton?.id).toBe("carton-1");
  });

  it("also matches by shipping_no, not only qr_ref", () => {
    const { result } = resolveLegacyGateDecision("SHP-001", baseEntities);
    expect(result.kind).toBe("green");
  });
});

describe("resolveLegacyGateDecision — RED (rejected / hold / duplicate)", () => {
  it("rejects an unknown reference", () => {
    const { result, label, carton } = resolveLegacyGateDecision("NOT-A-REAL-REF", baseEntities);
    expect(result).toMatchObject({ kind: "red", title: "REJECTED" });
    expect(label).toBeUndefined();
    expect(carton).toBeUndefined();
  });

  it("rejects when the shipping label's carton is missing", () => {
    const entities: LegacyGateEntities = { ...baseEntities, cartons: [] };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result).toMatchObject({ kind: "red", title: "REJECTED", reason: "Carton missing" });
  });

  it("holds a cancelled carton", () => {
    const entities: LegacyGateEntities = { ...baseEntities, cartons: [{ id: "carton-1", carton_no: "CTN-001", status: "cancelled" }] };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result).toMatchObject({ kind: "red", title: "HOLD", reason: "Carton status is cancelled" });
  });

  it("holds a held carton", () => {
    const entities: LegacyGateEntities = { ...baseEntities, cartons: [{ id: "carton-1", carton_no: "CTN-001", status: "held" }] };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result.reason).toBe("Carton status is held");
  });

  it("flags a duplicate when the carton is already dispatched", () => {
    const entities: LegacyGateEntities = { ...baseEntities, cartons: [{ id: "carton-1", carton_no: "CTN-001", status: "dispatched" }] };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result).toMatchObject({ kind: "red", title: "DUPLICATE", reason: "Carton already dispatched" });
  });

  it("holds when the PI is missing entirely", () => {
    const entities: LegacyGateEntities = { ...baseEntities, pis: [] };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result).toMatchObject({ kind: "red", title: "HOLD", reason: "PI not cleared" });
  });

  it("holds when the PI exists but isn't cleared yet", () => {
    const entities: LegacyGateEntities = { ...baseEntities, pis: [{ id: "pi-1", status: "pending" }] };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result.reason).toBe("PI not cleared");
  });

  it("holds a cleared PI with no invoice reference (financial control gap)", () => {
    const entities: LegacyGateEntities = { ...baseEntities, pis: [{ id: "pi-1", status: "cleared" }] };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result).toMatchObject({ kind: "red", title: "HOLD", reason: "Invoice missing" });
  });

  it("flags a duplicate when the shipping label itself was already dispatched", () => {
    const entities: LegacyGateEntities = {
      ...baseEntities,
      shippingLabels: [{ ...baseEntities.shippingLabels[0], status: "dispatched" }],
    };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result).toMatchObject({ kind: "red", title: "DUPLICATE", reason: "Shipping label already dispatched" });
  });
});

describe("resolveLegacyGateDecision — check ordering (most specific hold reason wins)", () => {
  it("a cancelled carton is reported even if the PI is also uncleared (carton check runs first)", () => {
    const entities: LegacyGateEntities = {
      ...baseEntities,
      cartons: [{ id: "carton-1", carton_no: "CTN-001", status: "cancelled" }],
      pis: [{ id: "pi-1", status: "pending" }],
    };
    const { result } = resolveLegacyGateDecision("QR-ABC", entities);
    expect(result.reason).toBe("Carton status is cancelled");
  });
});
