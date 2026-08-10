// Pure SKU rollup for Finance PI clearance — shared by the internal
// finance_pi_lines write (clearPI) and the customer-facing SKU-wise view in
// FinancePI.tsx, which duplicated this logic inline. Extracted so the
// rollup used to generate the actual finance PI line items can be tested
// independent of React state and Supabase.
import type { CartonContent, ProductionLabel } from "@/lib/types";

export interface SkuRollupEntry {
  sku: string;
  name: string;
  qty: number;
  net: number;
  gross: number;
}

/**
 * Rolls up carton contents into SKU-wise totals for the given carton IDs.
 * A label's SKU/name/weights are taken from its product metadata snapshot
 * (not re-joined against the live product master — see traceability
 * docs on why that's intentional); manual (non-labeled) entries fall back
 * to their recorded manual_sku with a "—" product name.
 */
export function rollupBySku(
  cartonIds: string[],
  contents: CartonContent[],
  labels: ProductionLabel[],
): SkuRollupEntry[] {
  const bySku: Record<string, SkuRollupEntry> = {};
  const items = contents.filter(c => c.carton_id && cartonIds.includes(c.carton_id));
  for (const it of items) {
    const lbl = labels.find(l => l.id === it.production_label_id);
    const sku = lbl?.metadata?.sku || it.manual_sku || "—";
    const name = lbl?.metadata?.product_name || "—";
    bySku[sku] ||= { sku, name, qty: 0, net: 0, gross: 0 };
    bySku[sku].qty += lbl ? 1 : (it.manual_qty ?? 1);
    bySku[sku].net += lbl?.net_weight || 0;
    bySku[sku].gross += lbl?.gross_weight || 0;
  }
  return Object.values(bySku);
}
