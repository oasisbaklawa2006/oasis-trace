import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/data", () => ({ invokeTraceMutation: invoke }));

describe("governed Trace mutation client", () => {
  beforeEach(() => invoke.mockReset());

  it("passes stable idempotency keys to atomic Core RPCs", async () => {
    invoke.mockResolvedValue({ id: "dpl-1" });
    const { traceMutations } = await import("./traceMutations");
    await traceMutations.createDpl({ dpl_no: "DPL-1" }, ["c-1"], "dpl:DPL-1");
    expect(invoke).toHaveBeenCalledWith("trace_create_dpl_v1", expect.objectContaining({
      p_carton_ids: ["c-1"], p_idempotency_key: "dpl:DPL-1",
    }));
  });

  it("routes PI membership through Core instead of client-side table writes", async () => {
    invoke.mockResolvedValue({ pi: { id: "pi-1" }, carton: { id: "c-1" }, link_id: "link-1" });
    const { traceMutations } = await import("./traceMutations");
    await traceMutations.addCartonToPi("c-1", null, "PI-1", "pi:PI-1:c-1");
    expect(invoke).toHaveBeenCalledWith("trace_add_carton_to_pi_v1", {
      p_carton_id: "c-1", p_pi_id: null, p_pi_no: "PI-1", p_idempotency_key: "pi:PI-1:c-1",
    });
  });
});
