import { describe, expect, it, vi, beforeEach } from "vitest";
import { allocateProductionIdentity } from "./productionIdentity";

const { invokeTraceMutation } = vi.hoisted(() => ({
  invokeTraceMutation: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
}));

describe("productionIdentity", () => {
  beforeEach(() => invokeTraceMutation.mockReset());

  it("uses Core RPC in live mode", async () => {
    invokeTraceMutation.mockResolvedValue("PL-20260907-0001");
    expect(await allocateProductionIdentity("production_label")).toBe("PL-20260907-0001");
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_allocate_identity_v1", {
      p_kind: "production_label",
    });
  });

  it("fails closed when Core RPC is not deployed", async () => {
    invokeTraceMutation.mockRejectedValueOnce(
      Object.assign(new Error("missing rpc"), { message: "function trace_allocate_identity_v1() does not exist" }),
    );
    await expect(allocateProductionIdentity("batch")).rejects.toThrow(/not deployed/i);
  });
});
