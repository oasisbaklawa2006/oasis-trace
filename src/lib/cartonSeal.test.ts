import { describe, expect, it, vi, beforeEach } from "vitest";
import { sealCartonWithHandover } from "./cartonSeal";

const { invokeRpc, listTable, insertRow } = vi.hoisted(() => ({
  invokeRpc: vi.fn(),
  listTable: vi.fn(),
  insertRow: vi.fn(),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/data", () => ({
  invokeTraceMutation: (...args: unknown[]) => invokeRpc(...args),
  listTable: (...args: unknown[]) => listTable(...args),
  insertRow: (...args: unknown[]) => insertRow(...args),
  isDuplicateError: (err: unknown) => (err as { code?: string })?.code === "23505",
}));

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

const signedEvidence = {
  version: "1.0" as const,
  integrityClass: "core_signed_v1" as const,
  stage: "packing" as const,
  entityType: "carton",
  entityId: "carton-1",
  referenceNo: "CTN-1",
  actorId: "actor-1",
  occurredAt: "2026-09-08T05:00:00.000Z",
  metadata: { label_count: 2 },
  contentHash: "signed-content",
  chainHash: "signed-chain",
};

const carton = {
  id: "carton-1",
  carton_no: "CTN-1",
  order_ref: "SO-2026-0001",
  status: "draft",
};

describe("sealCartonWithHandover — Core #259 binding", () => {
  beforeEach(() => {
    invokeRpc.mockReset();
    listTable.mockReset();
    insertRow.mockReset();
    supabaseConfigured.value = false;
    listTable.mockResolvedValue([]);
  });

  it("binds live seal to Core sign, verify, and evidence-bearing finalize only", async () => {
    supabaseConfigured.value = true;
    invokeRpc
      .mockResolvedValueOnce(signedEvidence)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ ...carton, status: "packed" });

    const result = await sealCartonWithHandover({
      carton,
      net: 5,
      gross: 5.25,
      copiedToClipboard: true,
      labelCount: 2,
      actorId: "actor-1",
    });

    expect(result.evidence.integrityClass).toBe("core_signed_v1");
    expect(invokeRpc).toHaveBeenNthCalledWith(1, "trace_sign_handover_evidence_v1", expect.objectContaining({
      p_stage: "packing",
      p_entity_id: "carton-1",
      p_actor_id: "actor-1",
    }));
    expect(invokeRpc).toHaveBeenNthCalledWith(2, "trace_verify_handover_evidence_v1", {
      p_evidence: signedEvidence,
      p_prior_hash: null,
      p_expected_action: "trace_carton_finalized",
      p_enforce_consumption: false,
    });
    expect(invokeRpc).toHaveBeenNthCalledWith(3, "trace_finalize_carton_v1", expect.objectContaining({
      p_carton_id: "carton-1",
      p_handover_evidence: signedEvidence,
      p_actor_id: "actor-1",
    }));
    expect(invokeRpc).not.toHaveBeenCalledWith("trace_insert_handover_audit_v1", expect.anything());
    expect(insertRow).not.toHaveBeenCalled();
  });

  it("requires actorId in live mode", async () => {
    supabaseConfigured.value = true;
    await expect(sealCartonWithHandover({
      carton,
      net: 5,
      gross: 5.25,
      copiedToClipboard: false,
      labelCount: 1,
    })).rejects.toThrow(/authenticated actorId/i);
    expect(invokeRpc).not.toHaveBeenCalled();
  });

  it("persists demo audit separately from finalize", async () => {
    invokeRpc.mockResolvedValueOnce({ ...carton, status: "packed" });
    insertRow.mockResolvedValue({ id: "audit-1" });

    const result = await sealCartonWithHandover({
      carton,
      net: 5,
      gross: 5.25,
      copiedToClipboard: false,
      labelCount: 1,
      actorId: "actor-1",
    });

    expect(result.evidence.integrityClass).toBe("software_chain_v1");
    expect(insertRow).toHaveBeenCalledWith("ols_audit_logs", expect.objectContaining({
      action: "carton_sealed",
      entity_id: "carton-1",
    }));
  });
});
