/**
 * external_ref synchronization and reconciliation (Trace consumer lane).
 *
 * Core owns canonical order UUID truth. Trace reconciles `ols_orders_cache`
 * bindings so Central scan handoff can resolve `order_id` deterministically.
 * Live mode invokes governed Core trace_reconcile_external_refs_v1 (Core #259);
 * demo mode applies stable software-validation bindings only.
 */
import { invokeTraceMutation, listTable, updateRow } from "@/lib/data";
import { resolveCentralOrderId, type CentralOrderRef } from "@/lib/centralTraceContract";
import { supabaseConfigured } from "@/lib/supabase";
import type { OrderCache } from "@/lib/types";

export type ExternalRefBindingStatus = "bound" | "unbound" | "invalid";

export interface OrderBindingRow {
  id: string;
  order_number: string;
  external_ref?: string;
  status: ExternalRefBindingStatus;
  centralOrderId: string | null;
}

export interface ReconciliationReport {
  total: number;
  bound: number;
  unbound: number;
  invalid: number;
  rows: OrderBindingRow[];
  reconciledAt: string;
}

export interface ExternalRefSyncResult {
  ok: boolean;
  report: ReconciliationReport;
  applied: number;
  message: string;
}

/** Deterministic demo bindings — software validation only, not production truth. */
export const DEMO_EXTERNAL_REFS: Record<string, string> = {
  "SO-2026-0001": "a1000001-0000-4000-8000-000000000001",
  "SO-2026-0002": "a1000002-0000-4000-8000-000000000002",
};

export function analyzeExternalRefBindings(orders: CentralOrderRef[]): ReconciliationReport {
  const rows: OrderBindingRow[] = orders.map(o => {
    const raw = o.external_ref?.trim();
    const centralOrderId = resolveCentralOrderId(o);
    let status: ExternalRefBindingStatus;
    if (!raw) status = "unbound";
    else if (centralOrderId) status = "bound";
    else status = "invalid";
    return {
      id: o.id,
      order_number: o.order_number,
      external_ref: raw,
      status,
      centralOrderId,
    };
  });
  return {
    total: rows.length,
    bound: rows.filter(r => r.status === "bound").length,
    unbound: rows.filter(r => r.status === "unbound").length,
    invalid: rows.filter(r => r.status === "invalid").length,
    rows,
    reconciledAt: new Date().toISOString(),
  };
}

export function formatReconcileResult(
  report: ReconciliationReport,
  applied: number,
): Pick<ExternalRefSyncResult, "ok" | "message"> {
  const ok = report.unbound === 0 && report.invalid === 0;
  if (!ok) {
    const parts: string[] = [];
    if (report.unbound > 0) parts.push(`${report.unbound} unbound`);
    if (report.invalid > 0) parts.push(`${report.invalid} invalid`);
    return {
      ok: false,
      message: `Reconcile incomplete: ${parts.join(", ")} order binding(s) remain unresolved.`,
    };
  }
  if (applied > 0) {
    return { ok: true, message: `Reconciled ${applied} order binding(s).` };
  }
  return { ok: true, message: "All orders bound." };
}

export async function reconcileExternalRefs(): Promise<ExternalRefSyncResult> {
  const orders = await listTable<OrderCache>("ols_orders_cache", { order: "order_number" });
  const initial = analyzeExternalRefBindings(orders);

  if (supabaseConfigured) {
    const result = await invokeTraceMutation<{
      bindings?: Array<{ cache_id: string; external_ref: string }>;
      applied?: number;
    }>("trace_reconcile_external_refs_v1", {});
    let applied = 0;
    for (const b of result.bindings ?? []) {
      await updateRow("ols_orders_cache", b.cache_id, { external_ref: b.external_ref });
      applied++;
    }
    const refreshed = await listTable<OrderCache>("ols_orders_cache", { order: "order_number" });
    const report = analyzeExternalRefBindings(refreshed);
    const { ok, message } = formatReconcileResult(report, result.applied ?? applied);
    return { ok, report, applied: result.applied ?? applied, message };
  }

  let applied = 0;
  for (const row of initial.rows) {
    if (row.status !== "unbound") continue;
    const demoRef = DEMO_EXTERNAL_REFS[row.order_number];
    if (!demoRef) continue;
    await updateRow("ols_orders_cache", row.id, { external_ref: demoRef });
    applied++;
  }
  const refreshed = await listTable<OrderCache>("ols_orders_cache", { order: "order_number" });
  const report = analyzeExternalRefBindings(refreshed);
  const { ok, message } = formatReconcileResult(report, applied);
  return { ok, report, applied, message };
}
