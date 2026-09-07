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

  it("routes carton seal through Core finalize RPC with idempotency key", async () => {
    invoke.mockResolvedValue({ id: "carton-1", status: "packed" });
    const { traceMutations } = await import("./traceMutations");
    await traceMutations.finalizeCarton("carton-1", 5, 5.25, true, "finalize-carton:carton-1");
    expect(invoke).toHaveBeenCalledWith("trace_finalize_carton_v1", {
      p_carton_id: "carton-1",
      p_net_weight: 5,
      p_gross_weight: 5.25,
      p_copied_to_clipboard: true,
      p_idempotency_key: "finalize-carton:carton-1",
      p_handover_evidence: null,
      p_actor_id: null,
    });
  });

  it("forwards handover evidence payload to finalize RPC when provided", async () => {
    invoke.mockResolvedValue({ id: "carton-1", status: "packed" });
    const evidence = {
      version: "1.0" as const,
      integrityClass: "software_chain_v1" as const,
      stage: "packing" as const,
      entityType: "carton",
      entityId: "carton-1",
      referenceNo: "CTN-1",
      occurredAt: "2026-09-07T00:00:00.000Z",
      metadata: {},
      contentHash: "abc",
      chainHash: "def",
    };
    const { traceMutations } = await import("./traceMutations");
    await traceMutations.finalizeCarton("carton-1", 5, 5.25, true, "finalize-carton:carton-1", {
      handoverEvidence: evidence,
      actorId: "user-1",
    });
    expect(invoke).toHaveBeenCalledWith("trace_finalize_carton_v1", expect.objectContaining({
      p_handover_evidence: evidence,
      p_actor_id: "user-1",
    }));
  });

  it("routes printer settings saves through Core authority instead of raw ols_printers updates", async () => {
    const settings = { darkness: 8, speed: 4, gapMm: 3, dpi: 203 };
    invoke.mockResolvedValue({ id: "printer-1", settings });
    const { traceMutations } = await import("./traceMutations");
    const row = await traceMutations.savePrinterSettings("printer-1", settings);
    expect(invoke).toHaveBeenCalledWith("trace_save_printer_settings_v1", {
      p_printer_id: "printer-1",
      p_settings: settings,
    });
    expect(row).toEqual({ id: "printer-1", settings });
  });

  it("propagates printer settings save failures without fallback writes", async () => {
    invoke.mockImplementationOnce(() =>
      Promise.reject(new Error("permission denied for function trace_save_printer_settings_v1")),
    );
    const { traceMutations } = await import("./traceMutations");
    await expect(traceMutations.savePrinterSettings("printer-1", { darkness: 8 })).rejects.toThrow(
      /permission denied for function trace_save_printer_settings_v1/,
    );
  });
});
