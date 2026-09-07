import { describe, expect, it, vi, beforeEach } from "vitest";
import { insertIdempotentHandoverAudit } from "./idempotentAudit";

const { listTable, insertRow } = vi.hoisted(() => ({
  listTable: vi.fn(),
  insertRow: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
  insertRow: (...args: unknown[]) => insertRow(...args),
  isDuplicateError: (err: unknown) => (err as { code?: string })?.code === "23505",
}));

describe("idempotentAudit", () => {
  beforeEach(() => {
    listTable.mockReset();
    insertRow.mockReset();
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
});
