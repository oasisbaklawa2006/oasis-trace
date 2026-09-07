import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  analyzeExternalRefBindings,
  DEMO_EXTERNAL_REFS,
  formatReconcileResult,
  reconcileExternalRefs,
} from "./externalRefSync";

const { listTable, updateRow, invokeTraceMutation } = vi.hoisted(() => ({
  listTable: vi.fn(),
  updateRow: vi.fn(),
  invokeTraceMutation: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
  updateRow: (...args: unknown[]) => updateRow(...args),
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

vi.mock("@/lib/supabase", () => ({ supabaseConfigured: false }));

describe("externalRefSync", () => {
  beforeEach(() => {
    listTable.mockReset();
    updateRow.mockReset();
    invokeTraceMutation.mockReset();
  });

  it("classifies bound, unbound, and invalid external_ref rows", () => {
    const report = analyzeExternalRefBindings([
      { id: "1", order_number: "SO-2026-0001", external_ref: DEMO_EXTERNAL_REFS["SO-2026-0001"] },
      { id: "2", order_number: "SO-2026-0002" },
      { id: "3", order_number: "SO-2026-0003", external_ref: "not-a-uuid" },
    ]);
    expect(report.bound).toBe(1);
    expect(report.unbound).toBe(1);
    expect(report.invalid).toBe(1);
  });

  it("reports incomplete reconcile when bindings remain unresolved", () => {
    const report = analyzeExternalRefBindings([
      { id: "1", order_number: "SO-2026-0001" },
    ]);
    const { ok, message } = formatReconcileResult(report, 0);
    expect(ok).toBe(false);
    expect(message).toMatch(/unbound/);
  });

  it("applies demo bindings for unbound orders in demo mode", async () => {
    listTable
      .mockResolvedValueOnce([
        { id: "o1", order_number: "SO-2026-0001" },
        { id: "o2", order_number: "SO-2026-0002" },
      ])
      .mockResolvedValueOnce([
        { id: "o1", order_number: "SO-2026-0001", external_ref: DEMO_EXTERNAL_REFS["SO-2026-0001"] },
        { id: "o2", order_number: "SO-2026-0002", external_ref: DEMO_EXTERNAL_REFS["SO-2026-0002"] },
      ]);
    updateRow.mockResolvedValue({});
    const result = await reconcileExternalRefs();
    expect(result.applied).toBe(2);
    expect(result.ok).toBe(true);
    expect(result.report.bound).toBe(2);
    expect(updateRow).toHaveBeenCalledTimes(2);
  });
});
