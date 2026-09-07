import { describe, expect, it, vi, beforeEach } from "vitest";
import { allocateNextCartonIndex } from "./cartonIndex";

const { listTable } = vi.hoisted(() => ({ listTable: vi.fn() }));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
}));

describe("cartonIndex", () => {
  beforeEach(() => listTable.mockReset());

  it("returns 1 when order has no cartons", async () => {
    listTable.mockResolvedValue([]);
    expect(await allocateNextCartonIndex("SO-1")).toBe(1);
  });

  it("allocates max existing index plus one from authoritative query", async () => {
    listTable.mockResolvedValue([
      { id: "1", order_ref: "SO-1", carton_index: 2 },
      { id: "2", order_ref: "SO-1", carton_index: 5 },
      { id: "3", order_ref: "SO-2", carton_index: 9 },
    ]);
    expect(await allocateNextCartonIndex("SO-1")).toBe(6);
  });
});
