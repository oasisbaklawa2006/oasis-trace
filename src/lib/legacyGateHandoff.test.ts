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

vi.mock("@/lib/supabase", () => ({ supabaseConfigured: false }));

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
});
