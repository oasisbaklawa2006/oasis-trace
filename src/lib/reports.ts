// Pure report builders — return { columns, rows, meta }. No UI, no I/O beyond
// listTable. Reusable by future scheduled jobs / API routes.
import { listTable } from "@/lib/data";
import type { Report } from "@/lib/exporters";
import { parseReason } from "@/lib/reprintPolicy";

export interface DateRange { from?: Date; to?: Date; }

function inRange(d: any, r?: DateRange) {
  if (!r || (!r.from && !r.to)) return true;
  if (!d) return false;
  const t = new Date(d).getTime();
  if (r.from && t < r.from.getTime()) return false;
  if (r.to && t > r.to.getTime() + 86_400_000) return false;
  return true;
}
const stamp = () => new Date().toLocaleString();

export async function batchTraceability(batchOrLabelOrOrder: string): Promise<Report> {
  const term = batchOrLabelOrOrder.trim().toLowerCase();
  const [labels, cartons, contents, dpls, pis, shipping, gates] = await Promise.all([
    listTable<any>("ols_production_labels"),
    listTable<any>("ols_cartons"),
    listTable<any>("ols_carton_contents"),
    listTable<any>("ols_dpl_documents"),
    listTable<any>("ols_finance_pi"),
    listTable<any>("ols_shipping_labels"),
    listTable<any>("ols_gate_scans"),
  ]);
  const matchedLabels = labels.filter(l =>
    [l.label_no, l.batch_no, l.metadata?.batch_no, l.metadata?.sku].some(v => String(v || "").toLowerCase() === term)
    || String(l.label_no || "").toLowerCase() === term
  );
  const rows: any[] = [];
  for (const l of matchedLabels) {
    const link = contents.find(c => c.production_label_id === l.id);
    const ctn = link ? cartons.find(c => c.id === link.carton_id) : undefined;
    const dpl = ctn ? dpls.find(d => d.order_ref === ctn.order_ref) : undefined;
    const pi = ctn ? pis.find(p => p.order_ref === ctn.order_ref) : undefined;
    const ship = ctn ? shipping.find(s => s.carton_id === ctn.id) : undefined;
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
  return {
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
  };
}

export async function cartonMovement(range?: DateRange): Promise<Report> {
  const [moves, labels, cartons] = await Promise.all([
    listTable<any>("ols_inventory_movements"),
    listTable<any>("ols_production_labels"),
    listTable<any>("ols_cartons"),
  ]);
  const rows = moves.filter(m => inRange(m.created_at, range)).map(m => {
    const l = labels.find(x => x.id === m.production_label_id);
    const c = cartons.find(x => x.carton_no === m.reference_no);
    return {
      when: new Date(m.created_at).toLocaleString(),
      type: m.movement_type, from: m.from_location, to: m.to_location,
      label: l?.label_no || "", carton: m.reference_no, customer: c?.customer_name,
    };
  });
  return {
    title: "Carton Movement Report", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "type", header: "Type" },
      { key: "from", header: "From" }, { key: "to", header: "To" },
      { key: "label", header: "Label" }, { key: "carton", header: "Carton" }, { key: "customer", header: "Customer" },
    ],
    rows,
  };
}

export async function dispatchVerification(range?: DateRange): Promise<Report> {
  const [shipping, cartons, pis, gates] = await Promise.all([
    listTable<any>("ols_shipping_labels"),
    listTable<any>("ols_cartons"),
    listTable<any>("ols_finance_pi"),
    listTable<any>("ols_gate_scans"),
  ]);
  const rows = shipping.filter(s => inRange(s.created_at, range)).map(s => {
    const c = cartons.find(x => x.id === s.carton_id);
    const p = pis.find(x => x.id === s.pi_id);
    const g = gates.find(x => x.shipping_label_id === s.id);
    return {
      shipping: s.shipping_no, qr: s.qr_ref, carton: c?.carton_no, status: c?.status,
      pi: p?.pi_no, invoice: p?.invoice_ref, eway: p?.eway_bill_no,
      consignee: s.consignee, gate: g?.result?.toUpperCase() || "—",
      gate_reason: g?.reason || "",
    };
  });
  return {
    title: "Dispatch Verification Report", generatedAt: stamp(),
    columns: [
      { key: "shipping", header: "Shipping" }, { key: "qr", header: "QR" },
      { key: "carton", header: "Carton" }, { key: "status", header: "Status" },
      { key: "pi", header: "PI" }, { key: "invoice", header: "Invoice" }, { key: "eway", header: "E-Way" },
      { key: "consignee", header: "Consignee" }, { key: "gate", header: "Gate" }, { key: "gate_reason", header: "Reason" },
    ],
    rows,
  };
}

export async function gateClearance(range?: DateRange): Promise<Report> {
  const [gates, ship] = await Promise.all([
    listTable<any>("ols_gate_scans"),
    listTable<any>("ols_shipping_labels"),
  ]);
  const rows = gates.filter(g => inRange(g.scanned_at || g.created_at, range)).map(g => {
    const s = ship.find(x => x.id === g.shipping_label_id);
    return {
      when: new Date(g.scanned_at || g.created_at).toLocaleString(),
      qr: g.qr_ref, result: g.result?.toUpperCase(), reason: g.reason || "",
      shipping: s?.shipping_no, consignee: s?.consignee,
    };
  });
  return {
    title: "Gate Clearance Report", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "qr", header: "QR" },
      { key: "result", header: "Result" }, { key: "reason", header: "Reason" },
      { key: "shipping", header: "Shipping" }, { key: "consignee", header: "Consignee" },
    ],
    rows,
  };
}

export async function printReprintAudit(range?: DateRange): Promise<Report> {
  const [logs, reqs] = await Promise.all([
    listTable<any>("ols_print_logs"),
    listTable<any>("ols_reprint_requests"),
  ]);
  const reqRows = reqs.filter(r => inRange(r.created_at, range)).map(r => {
    const p = parseReason(r.reason);
    return {
      when: new Date(r.created_at).toLocaleString(),
      ref_type: r.ref_type, ref_id: r.ref_id?.slice(0, 8),
      status: r.status, category: p.category, approver: p.approver || "", remarks: p.remarks || "",
      override: p.override || "", details: p.details || "",
    };
  });
  const printRows = logs.filter(l => inRange(l.created_at, range) && l.is_reprint).map(l => ({
    when: new Date(l.created_at).toLocaleString(),
    ref_type: l.ref_type, ref_id: l.ref_id?.slice(0, 8),
    status: l.success ? "printed" : "failed", category: l.reason || "", approver: "", remarks: "", override: "", details: "",
  }));
  return {
    title: "Print / Reprint Audit", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "ref_type", header: "Ref Type" }, { key: "ref_id", header: "Ref" },
      { key: "status", header: "Status" }, { key: "category", header: "Reason" },
      { key: "approver", header: "Approver" }, { key: "override", header: "Override" },
      { key: "remarks", header: "Remarks" }, { key: "details", header: "Details" },
    ],
    rows: [...reqRows, ...printRows].sort((a, b) => (a.when < b.when ? 1 : -1)),
  };
}

export async function financeDiscrepancy(range?: DateRange): Promise<Report> {
  const [pis, piCartons, cartons, dpls] = await Promise.all([
    listTable<any>("ols_finance_pi"),
    listTable<any>("ols_finance_pi_cartons"),
    listTable<any>("ols_cartons"),
    listTable<any>("ols_dpl_documents"),
  ]);
  const rows: any[] = [];
  for (const p of pis.filter(x => inRange(x.created_at, range))) {
    const attachedIds = piCartons.filter(c => c.pi_id === p.id).map(c => c.carton_id);
    const attached = cartons.filter(c => attachedIds.includes(c.id));
    const orderCartons = cartons.filter(c => c.order_ref === p.order_ref);
    const dpl = dpls.find(d => d.id === p.dpl_id);
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
  return {
    title: "Finance Discrepancy Report", generatedAt: stamp(),
    columns: [
      { key: "when", header: "When" }, { key: "pi", header: "PI" },
      { key: "status", header: "Status" }, { key: "dpl", header: "DPL" },
      { key: "attached", header: "Attached" }, { key: "order_cartons", header: "Order CTN" },
      { key: "invoice", header: "Invoice" }, { key: "tally", header: "Tally" },
      { key: "issues", header: "Issues" },
    ],
    rows,
  };
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
