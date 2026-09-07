import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolvePriorHandoverChainHash } from "./handoverChain";

const { listTable } = vi.hoisted(() => ({ listTable: vi.fn() }));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
}));

describe("handoverChain", () => {
  beforeEach(() => listTable.mockReset());

  it("returns entity-specific prior chain hash when present", async () => {
    listTable.mockResolvedValue([
      {
        id: "1",
        entity_type: "carton",
        entity_id: "c-1",
        details: { handover_evidence: { chainHash: "abc123" } },
      },
    ]);
    expect(await resolvePriorHandoverChainHash("carton", "c-1")).toBe("abc123");
  });

  it("falls back to latest handover when entity has no prior record", async () => {
    listTable.mockResolvedValue([
      { id: "1", details: { handover_evidence: { chainHash: "latest" } } },
    ]);
    expect(await resolvePriorHandoverChainHash("carton", "new")).toBe("latest");
  });

  it("selects newest hash from newest-first audit rows", async () => {
    listTable.mockResolvedValue([
      { id: "2", entity_type: "carton", entity_id: "c-1", details: { handover_evidence: { chainHash: "newest" } } },
      { id: "1", entity_type: "carton", entity_id: "c-1", details: { handover_evidence: { chainHash: "older" } } },
    ]);
    expect(await resolvePriorHandoverChainHash("carton", "c-1")).toBe("newest");
  });
});
