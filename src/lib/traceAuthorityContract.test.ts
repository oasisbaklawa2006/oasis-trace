import { describe, expect, it, vi, beforeEach } from "vitest";
import { allocateProductionIdentity } from "./productionIdentity";
import { createProductionWithAuthoritativeIds } from "./productionCreate";
import {
  buildHandoverEvidence,
  resolveHandoverEvidence,
  verifyAcceptedHandoverEvidence,
} from "./handoverEvidence";

const { invokeTraceMutation } = vi.hoisted(() => ({
  invokeTraceMutation: vi.fn(),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/data", () => ({
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

describe("traceAuthorityContract", () => {
  beforeEach(() => {
    invokeTraceMutation.mockReset();
    supabaseConfigured.value = false;
  });

  it("routes live production identity through Core RPC only", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockResolvedValue("PL-20260907-0042");
    await expect(allocateProductionIdentity("production_label")).resolves.toBe("PL-20260907-0042");
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_allocate_identity_v1", {
      p_kind: "production_label",
    });
  });

  it("routes live handover signing and verification through Core RPC only", async () => {
    supabaseConfigured.value = true;
    const signed = {
      version: "1.0" as const,
      integrityClass: "core_signed_v1" as const,
      stage: "packing" as const,
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      actorId: "actor-core-1",
      occurredAt: "2026-09-07T12:00:00.000Z",
      metadata: { labels: 1 },
      contentHash: "signed-content",
      chainHash: "signed-chain",
    };
    invokeTraceMutation.mockResolvedValueOnce(signed);
    const evidence = await resolveHandoverEvidence({
      stage: "packing",
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      metadata: { labels: 1 },
    });
    expect(evidence.integrityClass).toBe("core_signed_v1");

    invokeTraceMutation.mockResolvedValueOnce(true);
    await expect(verifyAcceptedHandoverEvidence(evidence)).resolves.toBe(true);
    expect(invokeTraceMutation).toHaveBeenNthCalledWith(2, "trace_verify_handover_evidence_v1", {
      p_evidence: signed,
      p_prior_hash: null,
    });
  });

  it("blocks client hash construction in configured live mode", async () => {
    supabaseConfigured.value = true;
    await expect(buildHandoverEvidence("packing", "carton", "c-1", "CTN-1", {}))
      .rejects.toThrow(/resolveHandoverEvidence/i);
  });

  it("uses server-assigned production identifiers from trace_create_production_v1 only", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockResolvedValueOnce({
      batch: { id: "b-1", batch_no: "BAT-20260907-099", product_id: "p-1" },
      labels: [{ id: "l-1", label_no: "PL-20260907-0999", batch_id: "b-1" }],
    });
    const result = await createProductionWithAuthoritativeIds(
      {
        product_id: "p-1",
        department_id: "d-1",
        shift: "A",
        mfg_date: "2026-09-07",
        shelf_life_days: 90,
        qc_status: "pending",
      },
      [{
        product_id: "p-1",
        department_id: "d-1",
        tray_serial: "T-1",
        net_weight: 5,
        gross_weight: 5.25,
        mfg_date: "2026-09-07",
        best_before: "2026-12-06",
        qc_status: "pending",
        status: "active",
      }],
      "create-production:authority-test",
    );
    expect(result.batch.batch_no).toBe("BAT-20260907-099");
    expect(result.labels[0].label_no).toBe("PL-20260907-0999");
    const createCall = invokeTraceMutation.mock.calls.find(([fn]) => fn === "trace_create_production_v1");
    expect(createCall?.[1]).toEqual({
      p_input: expect.not.objectContaining({ batch_no: expect.anything() }),
      p_labels: [expect.not.objectContaining({ label_no: expect.anything() })],
      p_idempotency_key: "create-production:authority-test",
    });
  });
});
