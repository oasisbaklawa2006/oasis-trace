// Pure report builders — return { columns, rows, meta }. No UI.
//
// Performance safeguards:
//   - All non-search reports default to a 7-day window (callers should also
//     pass a range; this is a soft fallback).
//   - HARD_ROW_CAP guards browser memory: rows above the cap are dropped and
//     the report is flagged `truncated: true` so the UI can warn operators
//     to narrow their filters.
//   - All listTable() calls go through a memoized loader so a single Reports
//     session does not re-scan the same table for every report kind.
import { listTable } from "@/lib/data";
import type { Report } from "@/lib/exporters";
import { parseReason } from "@/lib/reprintPolicy";

export interface DateRange { from?: Date; to?: Date; }

/** Hard browser-side row cap. Above this we truncate + warn. */
export const HARD_ROW_CAP = 5000;
/** Default look-back when no explicit range is supplied. */
export const DEFAULT_RANGE_DAYS = 7;

export function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function effective(r?: DateRange): DateRange {
  if (r && (r.from || r.to)) return r;
  return defaultRange();
}

function inRange(d: any, r?: DateRange) {
  if (!r || (!r.from && !r.to)) return true;
  if (!d) return false;
  const t = new Date(d).getTime();
  if (r.from && t < r.from.getTime()) return false;
  if (r.to && t > r.to.getTime() + 86_400_000) return false;
  return true;
}
const stamp = () => new Date().toLocaleString();

function capRows<T>(rows: T[]): { rows: T[]; truncated: boolean; total: number } {
  if (rows.length <= HARD_ROW_CAP) return { rows, truncated: false, total: rows.length };
  return { rows: rows.slice(0, HARD_ROW_CAP), truncated: true, total: rows.length };
}

function withCap(report: Omit<Report, "rows"> & { rows: any[] }): Report {
  const { rows, truncated, total } = capRows(report.rows);
  const meta = { ...(report.meta || {}), truncated, total, cap: HARD_ROW_CAP };
  const subtitle = truncated
    ? `${report.subtitle ? report.subtitle + " · " : ""}Truncated to ${HARD_ROW_CAP} of ${total} rows. Narrow filters.`
    : report.subtitle;
  return { ...report, rows, subtitle, meta };
}

// ---------- Memoized loader (per-session shared cache) ----------
const cache: Record<string, { at: number; data: any[] }> = {};
const TTL = 30_000;
async function load<T = any>(table: string): Promise<T[]> {
  const c = cache[table];
  if (c && Date.now() - c.at < TTL) return c.data as T[];
  const data = await listTable<T>(table);
  cache[table] = { at: Date.now(), data: data as any[] };
  return data;
}
/** Force-clear the loader cache (e.g. after a write). */
export function invalidateReportCache(table?: string) {
  if (!table) { for (const k of Object.keys(cache)) delete cache[k]; return; }
  delete cache[table];
}

// ---------- Builders ----------
export async function batchTraceability(batchOrLabelOrOrder: string): Promise<Report> {
  const term = batchOrLabelOrOrder.trim().toLowerCase();
  const [labels, cartons, contents, dpls, pis, shipping, gates] = await Promise.all([
    load<any>("ols_production_labels"), load<any>("ols_cartons"), load<any>("ols_carton_contents"),
    load<any>("ols_dpl_documents"), load<any>("ols_finance_pi"),
    load<any>("ols_shipping_labels"), load<any>("ols_gate_scans"),
  ]);
  const matchedLabels = labels.filter(l =>
    [l.label_no, l.batch_no, l.metadata?.batch_no, l.metadata?.sku].some(v => String(v || "").toLowerCase() === term)
    || String(l.label_no || "").toLowerCase() === term
  );
  const rows: any[] = [];
  for (const l of matchedLabels) {
    // FK-first chain resolution (avoid order_ref unless nothing else matches)
    const link = contents.find(c => c.production_label_id === l.id);
    const ctn = link ? cartons.find(c => c.id === link.carton_id) : undefined;
    const ship = ctn ? shipping.find(s => s.carton_id === ctn.id) : undefined;
    const pi = ship?.pi_id ? pis.find(p => p.id === ship.pi_id)
            : ctn ? pis.find(p => p.order_ref === ctn.order_ref) : undefined;
    const dpl = pi?.dpl_id ? dpls.find(d => d.id === pi.dpl_id)
             : ctn ? dpls.find(d => d.order_ref === ctn.order_ref) : undefined;
    const gate = ship ? gates.find(g => g.shipping_label_id === ship.id) : undefined;
    rows.push({
      label_no: l.label_no, sku: l.metadata?.sku, batch: l.batch_no || l.metadata?.batch_no,
      net: l.net_weight, mfg: l.mfg_date, qc: l.qc_status,
      carton: ctn?.carton_no, order: ctn?.order_ref, customer: ctn?.customer_name,
      dpl: dpl?.dpl_no, pi: pi?.pi_no, invoice: pi?.invoice_ref,
      shipping: ship?.shipping_no, qr: ship?.qr_ref,
      gate: gate?.result?.toUpperCase(), gate_at: gate?.scanned_at,
    });
  }
  return withCap({
    title: "Batch Traceability Report",
    subtitle: `Search: ${batchOrLabelOrOrder} · ${rows.length} label(s)`,
    generatedAt: stamp(),
    columns: [
      { key: "label_no", header: "Label" }, { key: "sku", header: "SKU" }, { key: "batch", header: "Batch" },
      { key: "net", header: "Net (kg)" }, { key: "mfg", header: "MFG" }, { key: "qc", header: "QC" },
      { key: "carton", header: "Carton" }, { key: "order", header: "Order" }, { key: "customer", header: "Customer" },
      { key: "dpl", header: "DPL" }, { key: "pi", header: "PI" }, { key: "invoice", header: "Invoice" },
      { key: "shipping", header: "Shipping" }, { key: "qr", header: "QR" },
      { key: "gate", header: "Gate" }, { key: "gate_at", header: "Gate at" },
    ],
    rows,
  });
}

export async function cartonMovement(range?: DateRange): Promise<Report> {
  const r = effective(range);
  const [moves, labels, cartons] = await Promise.all([
    load<any>("ols_inventory_movements"), load<any>("ols_production_labels"), load<any>("ols_cartons"),
  ]);
  const rows = moves.filter(m => inRange(m.created_at, r)).map(m => {
    const l = labels.find(x => x.id === m.production_label_id);
    const c = cartons.find(x => x.carton_no === m.reference_no);
    return {
      when: new Date(m.created_at).toLocaleString(),
      type: m.movement_type, from: m.from_location, to: m.to_location,
      label: l?.label_no || "", carton: m.reference_no, customer: c?.customer_name,
    };
  });
  return withCap({
    title: "Carton Movement Report", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "type", header: "Type" },
      { key: "from", header: "From" }, { key: "to", header: "To" },
      { key: "label", header: "Label" }, { key: "carton", header: "Carton" }, { key: "customer", header: "Customer" },
    ],
    rows,
  });
}

export async function dispatchVerification(range?: DateRange): Promise<Report> {
  const r = effective(range);
  const [shipping, cartons, pis, gates] = await Promise.all([
    load<any>("ols_shipping_labels"), load<any>("ols_cartons"),
    load<any>("ols_finance_pi"), load<any>("ols_gate_scans"),
  ]);
  const rows = shipping.filter(s => inRange(s.created_at, r)).map(s => {
    const c = cartons.find(x => x.id === s.carton_id);
    const p = s.pi_id ? pis.find(x => x.id === s.pi_id) : undefined;
    const g = gates.find(x => x.shipping_label_id === s.id);
    return {
      shipping: s.shipping_no, qr: s.qr_ref, carton: c?.carton_no, status: c?.status,
      pi: p?.pi_no, invoice: p?.invoice_ref, eway: p?.eway_bill_no,
      consignee: s.consignee, gate: g?.result?.toUpperCase() || "—",
      gate_reason: g?.reason || "",
    };
  });
  return withCap({
    title: "Dispatch Verification Report", generatedAt: stamp(),
    columns: [
      { key: "shipping", header: "Shipping" }, { key: "qr", header: "QR" },
      { key: "carton", header: "Carton" }, { key: "status", header: "Status" },
      { key: "pi", header: "PI" }, { key: "invoice", header: "Invoice" }, { key: "eway", header: "E-Way" },
      { key: "consignee", header: "Consignee" }, { key: "gate", header: "Gate" }, { key: "gate_reason", header: "Reason" },
    ],
    rows,
  });
}

export async function gateClearance(range?: DateRange): Promise<Report> {
  const r = effective(range);
  const [gates, ship] = await Promise.all([load<any>("ols_gate_scans"), load<any>("ols_shipping_labels")]);
  const rows = gates.filter(g => inRange(g.scanned_at || g.created_at, r)).map(g => {
    const s = ship.find(x => x.id === g.shipping_label_id);
    return {
      when: new Date(g.scanned_at || g.created_at).toLocaleString(),
      qr: g.qr_ref, result: g.result?.toUpperCase(), reason: g.reason || "",
      shipping: s?.shipping_no, consignee: s?.consignee,
    };
  });
  return withCap({
    title: "Gate Clearance Report", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "qr", header: "QR" },
      { key: "result", header: "Result" }, { key: "reason", header: "Reason" },
      { key: "shipping", header: "Shipping" }, { key: "consignee", header: "Consignee" },
    ],
    rows,
  });
}

export async function printReprintAudit(range?: DateRange): Promise<Report> {
  const r = effective(range);
  const [logs, reqs] = await Promise.all([load<any>("ols_print_logs"), load<any>("ols_reprint_requests")]);
  const reqRows = reqs.filter(x => inRange(x.created_at, r)).map(x => {
    const p = parseReason(x.reason);
    return {
      when: new Date(x.created_at).toLocaleString(),
      ref_type: x.ref_type, ref_id: x.ref_id?.slice(0, 8),
      status: x.status, category: p.category, approver: p.approver || "", remarks: p.remarks || "",
      override: p.override || "", details: p.details || "",
    };
  });
  const printRows = logs.filter(l => inRange(l.created_at, r) && l.is_reprint).map(l => ({
    when: new Date(l.created_at).toLocaleString(),
    ref_type: l.ref_type, ref_id: l.ref_id?.slice(0, 8),
    status: l.success ? "printed" : "failed", category: l.reason || "",
    approver: "", remarks: "", override: "", details: "",
  }));
  return withCap({
    title: "Print / Reprint Audit", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "ref_type", header: "Ref Type" }, { key: "ref_id", header: "Ref" },
      { key: "status", header: "Status" }, { key: "category", header: "Reason" },
      { key: "approver", header: "Approver" }, { key: "override", header: "Override" },
      { key: "remarks", header: "Remarks" }, { key: "details", header: "Details" },
    ],
    rows: [...reqRows, ...printRows].sort((a, b) => (a.when < b.when ? 1 : -1)),
  });
}

export async function financeDiscrepancy(range?: DateRange): Promise<Report> {
  const r = effective(range);
  const [pis, piCartons, cartons, dpls] = await Promise.all([
    load<any>("ols_finance_pi"), load<any>("ols_finance_pi_cartons"),
    load<any>("ols_cartons"), load<any>("ols_dpl_documents"),
  ]);
  const rows: any[] = [];
  for (const p of pis.filter(x => inRange(x.created_at, r))) {
    const attachedIds = piCartons.filter(c => c.pi_id === p.id).map(c => c.carton_id);
    const attached = cartons.filter(c => attachedIds.includes(c.id));
    const orderCartons = cartons.filter(c => c.order_ref === p.order_ref);
    const dpl = p.dpl_id ? dpls.find(d => d.id === p.dpl_id) : undefined;
    const issues: string[] = [];
    if (attached.length === 0) issues.push("No cartons attached");
    if (dpl && dpl.total_cartons && attached.length !== dpl.total_cartons) issues.push(`DPL says ${dpl.total_cartons}, PI has ${attached.length}`);
    if (orderCartons.length !== attached.length) issues.push(`Order has ${orderCartons.length} cartons, PI has ${attached.length}`);
    if (p.status === "cleared" && !p.invoice_ref) issues.push("Cleared without invoice");
    rows.push({
      when: new Date(p.created_at).toLocaleString(),
      pi: p.pi_no, status: p.status, dpl: dpl?.dpl_no || "",
      attached: attached.length, order_cartons: orderCartons.length,
      invoice: p.invoice_ref || "", tally: p.tally_invoice_no || "",
      issues: issues.join("; ") || "OK",
    });
  }
  return withCap({
    title: "Finance Discrepancy Report", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "pi", header: "PI" },
      { key: "status", header: "Status" }, { key: "dpl", header: "DPL" },
      { key: "attached", header: "Attached" }, { key: "order_cartons", header: "Order CTN" },
      { key: "invoice", header: "Invoice" }, { key: "tally", header: "Tally" },
      { key: "issues", header: "Issues" },
    ],
    rows,
  });
}

export const REPORT_BUILDERS = {
  batch: { label: "Batch Traceability", needsTerm: true, build: batchTraceability as any },
  carton: { label: "Carton Movement", needsTerm: false, build: (_t: string, r?: DateRange) => cartonMovement(r) },
  dispatch: { label: "Dispatch Verification", needsTerm: false, build: (_t: string, r?: DateRange) => dispatchVerification(r) },
  gate: { label: "Gate Clearance", needsTerm: false, build: (_t: string, r?: DateRange) => gateClearance(r) },
  reprint: { label: "Print / Reprint Audit", needsTerm: false, build: (_t: string, r?: DateRange) => printReprintAudit(r) },
  finance: { label: "Finance Discrepancy", needsTerm: false, build: (_t: string, r?: DateRange) => financeDiscrepancy(r) },
} as const;
export type ReportKey = keyof typeof REPORT_BUILDERS;
