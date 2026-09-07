import { describe, expect, it, vi, beforeEach } from "vitest";
import { allocateNextCartonIndex } from "./cartonIndex";

const { listTable, invokeTraceMutation, getMode } = vi.hoisted(() => ({
  listTable: vi.fn(),
  invokeTraceMutation: vi.fn(),
  getMode: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
  getMode: () => getMode(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
}));

describe("cartonIndex", () => {
  beforeEach(() => {
    listTable.mockReset();
    invokeTraceMutation.mockReset();
    getMode.mockReturnValue("live");
  });

  it("uses Core RPC when deployed", async () => {
    invokeTraceMutation.mockResolvedValue(7);
    expect(await allocateNextCartonIndex("SO-1")).toBe(7);
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_allocate_carton_index_v1", {
      p_order_ref: "SO-1",
    });
  });

  it("falls back to live max+1 when RPC is not deployed", async () => {
    invokeTraceMutation.mockRejectedValue(new Error("function trace_allocate_carton_index_v1() does not exist"));
    listTable.mockResolvedValue([
      { id: "1", order_ref: "SO-1", carton_index: 2 },
      { id: "2", order_ref: "SO-1", carton_index: 5 },
    ]);
    expect(await allocateNextCartonIndex("SO-1")).toBe(6);
  });

  it("rejects non-authoritative reads when live allocation is required", async () => {
    invokeTraceMutation.mockRejectedValue(new Error("function trace_allocate_carton_index_v1() does not exist"));
    listTable.mockResolvedValue([]);
    getMode.mockReturnValue("demo");
    await expect(allocateNextCartonIndex("SO-1")).rejects.toThrow(/non-authoritative/i);
  });
});
