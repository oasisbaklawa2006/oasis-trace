import { describe, expect, it, vi, beforeEach } from "vitest";
import { insertIdempotentHandoverAudit } from "./idempotentAudit";

const { listTable, insertRow, invokeTraceMutation } = vi.hoisted(() => ({
  listTable: vi.fn(),
  insertRow: vi.fn(),
  invokeTraceMutation: vi.fn(),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
  insertRow: (...args: unknown[]) => insertRow(...args),
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
  isDuplicateError: (err: unknown) => (err as { code?: string })?.code === "23505",
}));

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

describe("idempotentAudit", () => {
  beforeEach(() => {
    listTable.mockReset();
    insertRow.mockReset();
    invokeTraceMutation.mockReset();
    supabaseConfigured.value = false;
  });

  it("skips insert when idempotency key already exists", async () => {
    listTable.mockResolvedValue([
      { id: "1", entity_id: "c-1", details: { idempotency_key: "finalize-carton:c-1" } },
    ]);
    await insertIdempotentHandoverAudit({
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
          occurredAt: "2026-09-07T00:00:00.000Z",
          metadata: {},
          contentHash: "a",
          chainHash: "b",
        },
      },
    });
    expect(insertRow).not.toHaveBeenCalled();
  });

  it("serializes concurrent inserts for the same idempotency key", async () => {
    listTable.mockResolvedValue([]);
    let inserts = 0;
    insertRow.mockImplementation(async () => {
      inserts += 1;
      await new Promise(r => setTimeout(r, 20));
      return { id: `audit-${inserts}` };
    });
    const row = {
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
          occurredAt: "2026-09-07T00:00:00.000Z",
          metadata: {},
          contentHash: "a",
          chainHash: "b",
        },
      },
    };
    await Promise.all([
      insertIdempotentHandoverAudit(row),
      insertIdempotentHandoverAudit(row),
    ]);
    expect(insertRow).toHaveBeenCalledTimes(1);
  });

  it("routes live inserts through Core RPC with idempotency key", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockResolvedValue({ ok: true });
    await insertIdempotentHandoverAudit({
      action: "carton_sealed",
      entity_type: "carton",
      entity_id: "c-1",
      details: {
        idempotency_key: "finalize-carton:c-1",
        handover_evidence: {
          version: "1.0" as const,
          integrityClass: "core_signed_v1" as const,
          stage: "packing" as const,
          entityType: "carton",
          entityId: "c-1",
          referenceNo: "CTN-1",
          occurredAt: "2026-09-07T00:00:00.000Z",
          metadata: {},
          contentHash: "a",
          chainHash: "b",
        },
      },
    });
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_insert_handover_audit_v1", {
      p_action: "carton_sealed",
      p_entity_type: "carton",
      p_entity_id: "c-1",
      p_details: expect.objectContaining({ idempotency_key: "finalize-carton:c-1" }),
      p_idempotency_key: "finalize-carton:c-1",
    });
    expect(listTable).not.toHaveBeenCalled();
  });

  it("fails closed in live mode when Core audit RPC is not deployed", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockRejectedValueOnce(
      Object.assign(new Error("missing rpc"), { message: "function trace_insert_handover_audit_v1() does not exist" }),
    );
    await expect(insertIdempotentHandoverAudit({
      action: "carton_sealed",
      entity_type: "carton",
      entity_id: "c-1",
      details: {
        idempotency_key: "finalize-carton:c-1",
        handover_evidence: {
          version: "1.0" as const,
          integrityClass: "core_signed_v1" as const,
          stage: "packing" as const,
          entityType: "carton",
          entityId: "c-1",
          referenceNo: "CTN-1",
          occurredAt: "2026-09-07T00:00:00.000Z",
          metadata: {},
          contentHash: "a",
          chainHash: "b",
        },
      },
    })).rejects.toThrow(/not deployed/i);
  });
});
