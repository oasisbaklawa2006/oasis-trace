import { describe, expect, it, vi, beforeEach } from "vitest";
import { clearAsyncLocks } from "./asyncLock";
import { packLabelIntoCarton } from "./cartonPacking";

const { listTable, insertRow } = vi.hoisted(() => ({
  listTable: vi.fn(),
  insertRow: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listTable: (...args: unknown[]) => listTable(...args),
  insertRow: (...args: unknown[]) => insertRow(...args),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() { return supabaseConfigured.value; },
}));

const traceMutations = vi.hoisted(() => ({
  addCartonContent: vi.fn(),
}));
vi.mock("@/lib/traceMutations", () => ({
  traceMutations,
}));

vi.mock("@/lib/demoStore", () => ({
  demo: { remove: vi.fn() },
}));

describe("cartonPacking", () => {
  beforeEach(() => {
    clearAsyncLocks();
    listTable.mockReset();
    insertRow.mockReset();
    traceMutations.addCartonContent.mockReset();
    supabaseConfigured.value = false;
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

  it("serializes concurrent demo packs for the same idempotency key", async () => {
    const contentRows: Array<{ id: string; carton_id: string; production_label_id: string }> = [];
    listTable.mockImplementation(async (table: string) => {
      if (table === "ols_carton_contents") return contentRows;
      if (table === "ols_inventory_movements") return [];
      return [];
    });
    insertRow.mockImplementation(async (table: string, row: Record<string, unknown>) => {
      if (table === "ols_carton_contents") {
        const created = { id: `cc-${contentRows.length + 1}`, carton_id: row.carton_id as string, production_label_id: row.production_label_id as string };
        contentRows.push(created);
        return created;
      }
      return { id: "mv-1" };
    });

    const [a, b] = await Promise.all([
      packLabelIntoCarton("c-1", "CTN-1", "l-1"),
      packLabelIntoCarton("c-1", "CTN-1", "l-1"),
    ]);
    expect(a.content.id).toBe(b.content.id);
    expect(contentRows).toHaveLength(1);
  });

  it("fails closed in live mode when governed RPC is not deployed", async () => {
    supabaseConfigured.value = true;
    traceMutations.addCartonContent.mockRejectedValue(
      new Error("Trace operation rejected: function trace_add_carton_content_v1() does not exist"),
    );
    await expect(packLabelIntoCarton("c-1", "CTN-1", "l-1")).rejects.toThrow(/not deployed/i);
  });
});
