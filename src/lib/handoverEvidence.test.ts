import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assertAcceptedHandoverEvidence,
  assertSoftwareChainEvidence,
  buildHandoverEvidence,
  HANDOVER_INTEGRITY_AUTHENTICATED,
  isAuthenticatedHandoverEvidence,
  resolveHandoverEvidence,
  verifyAcceptedHandoverEvidence,
  verifyHandoverEvidence,
} from "./handoverEvidence";

const { invokeTraceMutation } = vi.hoisted(() => ({
  invokeTraceMutation: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

describe("handoverEvidence", () => {
  beforeEach(() => {
    invokeTraceMutation.mockReset();
    supabaseConfigured.value = false;
  });

  it("builds verifiable handover evidence", async () => {
    const evidence = await buildHandoverEvidence("gate", "shipping_label", "lbl-1", "SHP-0001", { result: "green" });
    expect(evidence.version).toBe("1.0");
    expect(evidence.integrityClass).toBe("software_chain_v1");
    expect(evidence.contentHash).toHaveLength(64);
    expect(await verifyHandoverEvidence(evidence)).toBe(true);
  });

  it("chains prior hash into subsequent evidence", async () => {
    const first = await buildHandoverEvidence("packing", "carton", "c-1", "CTN-1", { labels: 3 });
    const second = await buildHandoverEvidence(
      "dispatch",
      "carton",
      "c-1",
      "CTN-1",
      { status: "dispatched" },
      { priorHash: first.chainHash },
    );
    expect(second.chainHash).not.toBe(first.chainHash);
    expect(await verifyHandoverEvidence(second, first.chainHash)).toBe(true);
  });

  it("marks software_chain evidence as not authenticated", async () => {
    const evidence = await buildHandoverEvidence("packing", "carton", "c-1", "CTN-1", {});
    expect(isAuthenticatedHandoverEvidence(evidence)).toBe(false);
    assertSoftwareChainEvidence(evidence);
  });

  it("uses Core signing RPC in live mode", async () => {
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
      metadata: { labels: 2 },
      contentHash: "signed-content",
      chainHash: "signed-chain",
    };
    invokeTraceMutation.mockResolvedValue(signed);
    const evidence = await resolveHandoverEvidence({
      stage: "packing",
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      metadata: { labels: 2 },
      actorId: "actor-core-1",
      priorHash: "prior",
    });
    expect(evidence.integrityClass).toBe(HANDOVER_INTEGRITY_AUTHENTICATED);
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_sign_handover_evidence_v1", {
      p_stage: "packing",
      p_entity_type: "carton",
      p_entity_id: "c-1",
      p_reference_no: "CTN-1",
      p_metadata: { labels: 2 },
      p_actor_id: "actor-core-1",
      p_prior_hash: "prior",
    });
    assertAcceptedHandoverEvidence(evidence);
  });

  it("fails closed when Core signing RPC is not deployed", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockRejectedValueOnce(
      Object.assign(new Error("missing rpc"), { message: "function trace_sign_handover_evidence_v1() does not exist" }),
    );
    await expect(resolveHandoverEvidence({
      stage: "gate",
      entityType: "shipping_label",
      entityId: "lbl-1",
      referenceNo: "SHP-1",
      metadata: {},
      actorId: "actor-core-1",
    })).rejects.toThrow(/not deployed/i);
  });

  it("requires authenticated actorId in live mode", async () => {
    supabaseConfigured.value = true;
    await expect(resolveHandoverEvidence({
      stage: "packing",
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      metadata: {},
    })).rejects.toThrow(/authenticated actorId/i);
  });

  it("rejects client software_chain verification in live mode", async () => {
    supabaseConfigured.value = true;
    const evidence = {
      version: "1.0" as const,
      integrityClass: "software_chain_v1" as const,
      stage: "packing" as const,
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      occurredAt: "2026-09-07T00:00:00.000Z",
      metadata: {},
      contentHash: "a",
      chainHash: "b",
    };
    expect(await verifyAcceptedHandoverEvidence(evidence)).toBe(false);
  });

  it("rejects software_chain evidence in live acceptance guard", async () => {
    supabaseConfigured.value = true;
    const evidence = {
      version: "1.0" as const,
      integrityClass: "software_chain_v1" as const,
      stage: "packing" as const,
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      occurredAt: "2026-09-07T00:00:00.000Z",
      metadata: {},
      contentHash: "a",
      chainHash: "b",
    };
    expect(() => assertAcceptedHandoverEvidence(evidence)).toThrow(/core_signed_v1/i);
  });

  it("rejects client evidence construction in live mode", async () => {
    supabaseConfigured.value = true;
    await expect(buildHandoverEvidence("packing", "carton", "c-1", "CTN-1", {}))
      .rejects.toThrow(/resolveHandoverEvidence/i);
    await expect(verifyHandoverEvidence({
      version: "1.0",
      integrityClass: "software_chain_v1",
      stage: "packing",
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      occurredAt: "2026-09-07T00:00:00.000Z",
      metadata: {},
      contentHash: "a",
      chainHash: "b",
    })).rejects.toThrow(/verifyAcceptedHandoverEvidence/i);
  });

  it("rejects core_signed_v1 without server-bound actor", async () => {
    supabaseConfigured.value = true;
    expect(isAuthenticatedHandoverEvidence({
      version: "1.0",
      integrityClass: "core_signed_v1" as const,
      stage: "packing",
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      occurredAt: "2026-09-07T12:00:00.000Z",
      metadata: {},
      contentHash: "a",
      chainHash: "b",
    })).toBe(false);
  });

  it("does not client-verify core_signed_v1 via software chain recompute", async () => {
    const signed = {
      version: "1.0" as const,
      integrityClass: "core_signed_v1" as const,
      stage: "packing" as const,
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      actorId: "actor-core-1",
      occurredAt: "2026-09-07T12:00:00.000Z",
      metadata: {},
      contentHash: "signed-content",
      chainHash: "signed-chain",
    };
    expect(await verifyHandoverEvidence(signed)).toBe(false);
  });

  it("verifies authenticated evidence through Core RPC in live mode", async () => {
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
      metadata: {},
      contentHash: "signed-content",
      chainHash: "signed-chain",
    };
    invokeTraceMutation.mockResolvedValue(true);
    expect(await verifyAcceptedHandoverEvidence(signed, { priorHash: "prior" })).toBe(true);
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_verify_handover_evidence_v1", {
      p_evidence: signed,
      p_prior_hash: "prior",
      p_expected_action: null,
      p_enforce_consumption: false,
    });
  });

  it("fails closed when Core verify RPC is not deployed", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockRejectedValueOnce(
      Object.assign(new Error("missing rpc"), { message: "function trace_verify_handover_evidence_v1() does not exist" }),
    );
    await expect(verifyAcceptedHandoverEvidence({
      version: "1.0",
      integrityClass: "core_signed_v1" as const,
      stage: "packing",
      entityType: "carton",
      entityId: "c-1",
      referenceNo: "CTN-1",
      actorId: "actor-core-1",
      occurredAt: "2026-09-07T12:00:00.000Z",
      metadata: {},
      contentHash: "a",
      chainHash: "b",
    })).rejects.toThrow(/not deployed/i);
  });
});
