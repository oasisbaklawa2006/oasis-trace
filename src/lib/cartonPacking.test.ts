import { describe, expect, it, vi, beforeEach } from "vitest";
import { packLabelIntoCarton } from "./cartonPacking";

const { listTable, insertRow } = vi.hoisted(() => ({
  listTable: vi.fn(),
  insertRow: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
  insertRow: (...args: unknown[]) => insertRow(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: false,
}));

describe("cartonPacking demo fallback", () => {
  beforeEach(() => {
    listTable.mockReset();
    insertRow.mockReset();
    listTable.mockImplementation(async (table: string) => {
      if (table === "ols_carton_contents") return [];
      if (table === "ols_inventory_movements") return [];
      return [];
    });
  });

  it("returns existing content without duplicating movement", async () => {
    listTable.mockImplementation(async (table: string) => {
      if (table === "ols_carton_contents") {
        return [{ id: "cc-1", carton_id: "c-1", production_label_id: "l-1" }];
      }
      if (table === "ols_inventory_movements") {
        return [{
          production_label_id: "l-1",
          movement_type: "carton_pack",
          metadata: { idempotency_key: "carton-pack:c-1:l-1" },
        }];
      }
      return [];
    });
    const result = await packLabelIntoCarton("c-1", "CTN-1", "l-1");
    expect(result.content.id).toBe("cc-1");
    expect(insertRow).not.toHaveBeenCalled();
  });

  it("completes missing movement when content already exists", async () => {
    listTable.mockImplementation(async (table: string) => {
      if (table === "ols_carton_contents") {
        return [{ id: "cc-1", carton_id: "c-1", production_label_id: "l-1" }];
      }
      return [];
    });
    insertRow.mockResolvedValue({ id: "mv-1" });
    const result = await packLabelIntoCarton("c-1", "CTN-1", "l-1");
    expect(result.content.id).toBe("cc-1");
    expect(insertRow).toHaveBeenCalledWith("ols_inventory_movements", expect.objectContaining({
      metadata: { idempotency_key: "carton-pack:c-1:l-1" },
    }));
  });
});
