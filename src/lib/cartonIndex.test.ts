import { describe, expect, it, vi, beforeEach } from "vitest";
import { allocateNextCartonIndex } from "./cartonIndex";

const { listTable, invokeTraceMutation } = vi.hoisted(() => ({
  listTable: vi.fn(),
  invokeTraceMutation: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
}));

describe("cartonIndex", () => {
  beforeEach(() => {
    listTable.mockReset();
    invokeTraceMutation.mockReset();
  });

  it("uses Core RPC when deployed", async () => {
    invokeTraceMutation.mockResolvedValue(7);
    expect(await allocateNextCartonIndex("SO-1")).toBe(7);
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_allocate_carton_index_v1", {
      p_order_ref: "SO-1",
    });
  });

  it("fails closed when Core RPC is not deployed", async () => {
    invokeTraceMutation.mockRejectedValue(new Error("function trace_allocate_carton_index_v1() does not exist"));
    await expect(allocateNextCartonIndex("SO-1")).rejects.toThrow(/not deployed/i);
    expect(listTable).not.toHaveBeenCalled();
  });
});
