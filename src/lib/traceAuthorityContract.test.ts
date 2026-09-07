import { describe, expect, it, vi, beforeEach } from "vitest";
import { allocateProductionIdentity } from "./productionIdentity";
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
});
