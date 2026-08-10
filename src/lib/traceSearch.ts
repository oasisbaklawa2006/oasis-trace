// In-memory traceability search index. Pulls every entity once, normalizes to
// a flat document list, and supports prefix + fuzzy ranking (token-overlap +
// Levenshtein) without adding a dependency.
import { listTable } from "@/lib/data";
import type { Carton, DplDocument, FinancePi, GateScanRow, ProductionLabel, ShippingLabelRow } from "@/lib/types";

/** The underlying row a SearchDoc was built from. Callers should narrow via
 *  SearchDoc.kind and cast to the matching row type from `@/lib/types`. */
export type SearchDocRaw = unknown;

export type EntityKind =
  | "production_label" | "carton" | "dpl" | "pi" | "shipping"
  | "gate_scan" | "customer" | "order" | "sku" | "batch";

export interface SearchDoc {
  kind: EntityKind;
  id: string;
  ref: string;            // canonical ref (label_no, carton_no, etc.)
  label: string;          // human-readable summary
  keywords: string[];     // searchable tokens (lowercased)
  raw: SearchDocRaw;
}

const RECENT_KEY = "ols_recent_searches";
const RECENT_MAX = 10;

export function recentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
export function pushRecent(q: string) {
  const v = q.trim(); if (!v) return;
  const list = recentSearches().filter(x => x !== v);
  list.unshift(v);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* ignore */ }
}
export function clearRecent() { try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ } }

export async function buildIndex(): Promise<SearchDoc[]> {
  const [labels, cartons, dpls, pis, shipping, gates] = await Promise.all([
    listTable<ProductionLabel>("ols_production_labels"),
    listTable<Carton>("ols_cartons"),
    listTable<DplDocument>("ols_dpl_documents"),
    listTable<FinancePi>("ols_finance_pi"),
    listTable<ShippingLabelRow>("ols_shipping_labels"),
    listTable<GateScanRow>("ols_gate_scans"),
  ]);
  const docs: SearchDoc[] = [];
  const seenSku = new Set<string>(), seenBatch = new Set<string>(), seenCust = new Set<string>(), seenOrder = new Set<string>();

  for (const l of labels) {
    docs.push({
      kind: "production_label", id: l.id, ref: l.label_no,
      label: `${l.label_no} · ${l.metadata?.product_name || l.product_name || "Production label"}`,
      keywords: lower([l.label_no, l.metadata?.sku, l.metadata?.product_name, l.tray_serial, l.batch_no, l.metadata?.batch_no]),
      raw: l,
    });
    const sku = l.metadata?.sku; if (sku && !seenSku.has(sku)) { seenSku.add(sku); docs.push({ kind: "sku", id: sku, ref: sku, label: `SKU ${sku}`, keywords: lower([sku, l.metadata?.product_name]), raw: { sku, name: l.metadata?.product_name } }); }
    const batch = l.batch_no || l.metadata?.batch_no; if (batch && !seenBatch.has(batch)) { seenBatch.add(batch); docs.push({ kind: "batch", id: batch, ref: batch, label: `Batch ${batch}`, keywords: lower([batch]), raw: { batch } }); }
  }
  for (const c of cartons) {
    docs.push({ kind: "carton", id: c.id, ref: c.carton_no, label: `${c.carton_no} · ${c.customer_name || c.order_ref || ""}`,
      keywords: lower([c.carton_no, c.order_ref, c.customer_name, c.customer_code]), raw: c });
    if (c.customer_name && !seenCust.has(c.customer_name)) { seenCust.add(c.customer_name); docs.push({ kind: "customer", id: c.customer_code || c.customer_name, ref: c.customer_name, label: `Customer ${c.customer_name}`, keywords: lower([c.customer_name, c.customer_code]), raw: c }); }
    if (c.order_ref && !seenOrder.has(c.order_ref)) { seenOrder.add(c.order_ref); docs.push({ kind: "order", id: c.order_ref, ref: c.order_ref, label: `Order ${c.order_ref}`, keywords: lower([c.order_ref, c.customer_name]), raw: c }); }
  }
  for (const d of dpls) docs.push({ kind: "dpl", id: d.id, ref: d.dpl_no, label: `${d.dpl_no} · ${d.customer_name || d.order_ref || ""}`, keywords: lower([d.dpl_no, d.order_ref, d.customer_name, d.destination]), raw: d });
  for (const p of pis) docs.push({ kind: "pi", id: p.id, ref: p.pi_no, label: `${p.pi_no} · ${p.invoice_ref || p.customer_name || ""}`, keywords: lower([p.pi_no, p.invoice_ref, p.tally_invoice_no, p.eway_bill_no, p.customer_name, p.order_ref]), raw: p });
  for (const s of shipping) docs.push({ kind: "shipping", id: s.id, ref: s.shipping_no, label: `${s.shipping_no} · ${s.consignee || ""}`, keywords: lower([s.shipping_no, s.qr_ref, s.invoice_ref, s.eway_ref, s.transport_ref, s.consignee]), raw: s });
  for (const g of gates) docs.push({ kind: "gate_scan", id: g.id, ref: g.qr_ref || g.id, label: `Gate ${g.result?.toUpperCase()} · ${g.qr_ref || ""}`, keywords: lower([g.qr_ref, g.reason]), raw: g });
  return docs;
}

function lower(arr: unknown[]): string[] {
  return arr.filter(Boolean).map(v => String(v).toLowerCase());
}

// ---------- Ranking ----------
function levenshtein(a: string, b: string): number {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      const cur = Math.min(v0[j + 1] + 1, prev + 1, v0[j] + cost);
      v0[j] = prev; prev = cur;
    }
    v0[b.length] = prev;
  }
  return v0[b.length];
}

export function search(docs: SearchDoc[], q: string, limit = 25): SearchDoc[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const exactRef = docs.filter(d => d.ref?.toLowerCase() === term);
  if (exactRef.length) return exactRef.slice(0, limit);

  const scored: Array<{ d: SearchDoc; score: number }> = [];
  for (const d of docs) {
    let best = 0;
    for (const k of d.keywords) {
      if (!k) continue;
      if (k === term) { best = Math.max(best, 100); continue; }
      if (k.startsWith(term)) { best = Math.max(best, 80); continue; }
      if (k.includes(term)) { best = Math.max(best, 60); continue; }
      if (term.length >= 4 && k.length >= 4) {
        const dist = levenshtein(term, k);
        const tol = Math.max(1, Math.floor(term.length / 4));
        if (dist <= tol) best = Math.max(best, 40 - dist * 5);
      }
    }
    if (best > 0) scored.push({ d, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.d);
}

export const KIND_LABEL: Record<EntityKind, string> = {
  production_label: "Label", carton: "Carton", dpl: "DPL", pi: "PI",
  shipping: "Shipping", gate_scan: "Gate", customer: "Customer", order: "Order",
  sku: "SKU", batch: "Batch",
};
