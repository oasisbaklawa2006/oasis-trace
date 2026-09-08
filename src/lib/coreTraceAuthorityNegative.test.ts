import { beforeEach, describe, expect, it, vi } from "vitest";
import { productionNum } from "./numbering";
import { createProductionWithAuthoritativeIds } from "./productionCreate";
import {
  buildHandoverEvidence,
  resolveHandoverEvidence,
  verifyAcceptedHandoverEvidence,
} from "./handoverEvidence";
import { insertIdempotentHandoverAudit } from "./idempotentAudit";
import { reconcileExternalRefs } from "./externalRefSync";
import { allocateNextCartonIndex } from "./cartonIndex";
import { isPermanentSubmitFailureReason } from "./centralTraceContract";

const { invokeTraceMutation, listTable, updateRow } = vi.hoisted(() => ({
  invokeTraceMutation: vi.fn(),
  listTable: vi.fn(),
  updateRow: vi.fn(),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/data", () => ({
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
  listTable: (...args: unknown[]) => listTable(...args),
  updateRow: (...args: unknown[]) => updateRow(...args),
  isDuplicateError: (err: unknown) => (err as { code?: string })?.code === "23505",
}));

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

describe("Core #259 negative authority paths", () => {
  beforeEach(() => {
    invokeTraceMutation.mockReset();
    listTable.mockReset();
    updateRow.mockReset();
    supabaseConfigured.value = false;
  });

  it("rejects live production identity pre-allocation", () => {
    supabaseConfigured.value = true;
    expect(() => productionNum.batch()).toThrow(/createProductionWithAuthoritativeIds/i);
    expect(() => productionNum.productionLabel()).toThrow(/createProductionWithAuthoritativeIds/i);
  });

  it("rejects client handover hash construction in live mode", async () => {
    supabaseConfigured.value = true;
    await expect(buildHandoverEvidence("packing", "carton", "c-1", "CTN-1", {}))
      .rejects.toThrow(/resolveHandoverEvidence/i);
  });

  it("rejects live handover signing without authenticated actorId", async () => {
    supabaseConfigured.value = true;
    await expect(resolveHandoverEvidence({
      stage: "packing",
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      metadata: {},
    })).rejects.toThrow(/authenticated actorId/i);
  });

  it("rejects software_chain evidence in live verify acceptance", async () => {
    supabaseConfigured.value = true;
    const clientEvidence = {
      version: "1.0" as const,
      integrityClass: "software_chain_v1" as const,
      stage: "packing" as const,
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      occurredAt: "2026-09-08T00:00:00.000Z",
      metadata: {},
      contentHash: "client-hash",
      chainHash: "client-chain",
    };
    expect(await verifyAcceptedHandoverEvidence(clientEvidence)).toBe(false);
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated evidence before live audit RPC", async () => {
    supabaseConfigured.value = true;
    await expect(insertIdempotentHandoverAudit({
      action: "carton_sealed",
      entity_type: "carton",
      entity_id: "c-1",
      details: {
        idempotency_key: "finalize-carton:c-1",
        handover_evidence: {
          version: "1.0" as const,
          integrityClass: "software_chain_v1" as const,
          stage: "packing" as const,
          entityType: "carton",
          entityId: "c-1",
          referenceNo: "CTN-1",
          occurredAt: "2026-09-08T00:00:00.000Z",
          metadata: {},
          contentHash: "a",
          chainHash: "b",
        },
      },
    })).rejects.toThrow(/core_signed_v1/i);
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });

  it("fails closed when live carton index RPC is missing", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockRejectedValueOnce(
      Object.assign(new Error("missing rpc"), { message: "function trace_allocate_carton_index_v1() does not exist" }),
    );
    await expect(allocateNextCartonIndex("SO-1")).rejects.toThrow(/not deployed/i);
    expect(listTable).not.toHaveBeenCalled();
  });

  it("fails closed when live external_ref reconcile RPC is missing", async () => {
    supabaseConfigured.value = true;
    listTable.mockResolvedValue([]);
    invokeTraceMutation.mockRejectedValueOnce(
      Object.assign(new Error("missing rpc"), { message: "function trace_reconcile_external_refs_v1() does not exist" }),
    );
    await expect(reconcileExternalRefs()).rejects.toThrow(/does not exist|not deployed|rejected/i);
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("does not send client batch_no to trace_create_production_v1 in live mode", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockResolvedValueOnce({
      batch: { id: "b-1", batch_no: "BAT-20260908-001" },
      labels: [{ id: "l-1", label_no: "PL-20260908-0001" }],
    });
    await createProductionWithAuthoritativeIds(
      {
        product_id: "p-1",
        department_id: "d-1",
        shift: "A",
        mfg_date: "2026-09-08",
        shelf_life_days: 90,
        qc_status: "pending",
      },
      [{
        product_id: "p-1",
        department_id: "d-1",
        tray_serial: "T-1",
        net_weight: 5,
        gross_weight: 5.25,
        mfg_date: "2026-09-08",
        best_before: "2026-12-08",
        qc_status: "pending",
        status: "active",
      }],
      "create-production:neg-test",
    );
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_create_production_v1", {
      p_input: expect.not.objectContaining({ batch_no: expect.anything() }),
      p_labels: [expect.not.objectContaining({ label_no: expect.anything() })],
      p_idempotency_key: "create-production:neg-test",
    });
  });

  it("classifies permanent offline/submit contract failures as non-retryable", () => {
    expect(isPermanentSubmitFailureReason("invalid_contract")).toBe(true);
    expect(isPermanentSubmitFailureReason("forbidden")).toBe(true);
    expect(isPermanentSubmitFailureReason("transient_network")).toBe(false);
  });
});
