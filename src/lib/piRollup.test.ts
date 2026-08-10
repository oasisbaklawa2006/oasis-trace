// Covers the PI-clearance financial rollup: the exact computation that
// becomes ols_finance_pi_lines rows (and the customer-facing SKU view) when
// a PI is cleared. A regression here silently mis-invoices a customer.
import { describe, it, expect } from "vitest";
import { rollupBySku } from "./piRollup";
import type { CartonContent, ProductionLabel } from "./types";

const labels: ProductionLabel[] = [
  { id: "label-1", label_no: "PL-1", net_weight: 5, gross_weight: 5.25, metadata: { sku: "CPB-5000", product_name: "Cashew Pyramid Baklawa" } },
  { id: "label-2", label_no: "PL-2", net_weight: 2, gross_weight: 2.18, metadata: { sku: "ASB-2000", product_name: "Assorted Baklawa" } },
  { id: "label-3", label_no: "PL-3", net_weight: 5, gross_weight: 5.25, metadata: { sku: "CPB-5000", product_name: "Cashew Pyramid Baklawa" } },
];

const contents: CartonContent[] = [
  { id: "cc-1", carton_id: "carton-1", production_label_id: "label-1" },
  { id: "cc-2", carton_id: "carton-1", production_label_id: "label-2" },
  { id: "cc-3", carton_id: "carton-2", production_label_id: "label-3" },
  { id: "cc-4", carton_id: "carton-3", manual_sku: "MANUAL-SKU", manual_qty: 1 }, // no production label
];

describe("rollupBySku", () => {
  it("groups by SKU and sums quantity/net/gross across multiple cartons", () => {
    const rollup = rollupBySku(["carton-1", "carton-2"], contents, labels);
    const cpb = rollup.find(r => r.sku === "CPB-5000");
    expect(cpb).toMatchObject({ name: "Cashew Pyramid Baklawa", qty: 2, net: 10, gross: 10.5 });
    const asb = rollup.find(r => r.sku === "ASB-2000");
    expect(asb).toMatchObject({ name: "Assorted Baklawa", qty: 1, net: 2, gross: 2.18 });
  });

  it("only includes cartons in the given cartonIds list", () => {
    const rollup = rollupBySku(["carton-1"], contents, labels);
    expect(rollup.find(r => r.sku === "CPB-5000")?.qty).toBe(1);
    expect(rollup.find(r => r.sku === "ASB-2000")).toBeDefined();
  });

  it("falls back to manual_sku with a placeholder product name for unlabeled contents", () => {
    const rollup = rollupBySku(["carton-3"], contents, labels);
    expect(rollup).toEqual([{ sku: "MANUAL-SKU", name: "—", qty: 1, net: 0, gross: 0 }]);
  });

  it("returns an empty rollup for cartons with no contents", () => {
    expect(rollupBySku(["carton-empty"], contents, labels)).toEqual([]);
  });

  it("is order-independent: the same cartons in a different order produce the same totals", () => {
    const a = rollupBySku(["carton-1", "carton-2"], contents, labels);
    const b = rollupBySku(["carton-2", "carton-1"], contents, labels);
    const sortBySku = (r: typeof a) => [...r].sort((x, y) => x.sku.localeCompare(y.sku));
    expect(sortBySku(a)).toEqual(sortBySku(b));
  });
});
