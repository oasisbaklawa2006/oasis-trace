import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeLegacyGateHandoff } from "./legacyGateHandoff";

const { insertRow, updateRow, listTable, invokeTraceMutation } = vi.hoisted(() => ({
  insertRow: vi.fn(),
  updateRow: vi.fn(),
  listTable: vi.fn(),
  invokeTraceMutation: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  insertRow: (...args: unknown[]) => insertRow(...args),
  updateRow: (...args: unknown[]) => updateRow(...args),
  listTable: (...args: unknown[]) => listTable(...args),
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

vi.mock("@/lib/handoverChain", () => ({
  resolvePriorHandoverChainHash: vi.fn().mockResolvedValue(undefined),
}));

describe("legacyGateHandoff", () => {
  beforeEach(() => {
    insertRow.mockReset();
    updateRow.mockReset();
    listTable.mockReset();
    insertRow.mockResolvedValue({});
    updateRow.mockResolvedValue({});
    listTable.mockResolvedValue([]);
  });

  it("records red gate scan without dispatch writes", async () => {
    const result = await executeLegacyGateHandoff({
      ref: "QR-UNKNOWN",
      shippingLabels: [],
      cartons: [],
      pis: [],
    });
    expect(result.decision.result.kind).toBe("red");
    expect(updateRow).not.toHaveBeenCalled();
    expect(insertRow).toHaveBeenCalled();
  });

  it("fails closed in live mode when governed gate RPC is not deployed", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockRejectedValueOnce(
      Object.assign(new Error("missing rpc"), { message: "function trace_legacy_gate_clear_v1() does not exist" }),
    );
    await expect(executeLegacyGateHandoff({
      ref: "QR-ABC",
      shippingLabels: [{
        id: "ship-1",
        qr_ref: "QR-ABC",
        shipping_no: "SHP-001",
        carton_id: "carton-1",
        pi_id: "pi-1",
        status: "generated",
      }],
      cartons: [{ id: "carton-1", carton_no: "CTN-001", status: "shipping_labelled" }],
      pis: [{ id: "pi-1", pi_no: "PI-001", status: "cleared", invoice_ref: "INV-001" }],
    })).rejects.toThrow(/not deployed/i);
    expect(updateRow).not.toHaveBeenCalled();
  });
});
