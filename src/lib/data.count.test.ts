import { describe, expect, it, vi, beforeEach } from "vitest";
import { countTable } from "./data";

vi.mock("./supabase", () => ({
  supabase: null,
  supabaseConfigured: false,
}));

describe("countTable demo mode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("counts rows with eq/neq/in filters in demo store", async () => {
    const { demo } = await import("./demoStore");
    demo.insert("ols_cartons", { status: "packed" });
    demo.insert("ols_cartons", { status: "finance_received" });
    demo.insert("ols_cartons", { status: "dispatched" });
    demo.insert("ols_shipping_labels", { status: "active" });
    demo.insert("ols_shipping_labels", { status: "dispatched" });

    const { countTable: count } = await import("./data");
    expect(await count("ols_cartons", { column: "status", op: "in", value: ["packed", "finance_received"] })).toBe(2);
    expect(await count("ols_cartons", { column: "status", op: "eq", value: "dispatched" })).toBe(1);
    expect(await count("ols_shipping_labels", { column: "status", op: "neq", value: "dispatched" })).toBe(1);
  });
});
