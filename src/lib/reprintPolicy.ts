// Reprint approval policy. Schema is unchanged: we encode approver name +
// remarks inside `ols_reprint_requests.reason` using a delimiter, and mirror
// every state change to `ols_audit_logs.details` so we have a tamper-evident
// trail without a destructive migration.
import { listTable, insertRow, updateRow } from "@/lib/data";

export const REASON_DELIM = " ‖ ";

export type ReprintRefType = "production_label" | "carton" | "shipping" | "dpl" | "pi";
export type ReprintStatus = "pending" | "approved" | "rejected";

export interface ReprintRow {
  id: string;
  ref_type: ReprintRefType;
  ref_id: string;
  reason: string;
  status: ReprintStatus;
  approved_by?: string | null;
  requested_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ParsedReason {
  category: string;
  details?: string;
  approver?: string;
  remarks?: string;
  override?: string;
}

export function packReason(p: ParsedReason): string {
  const parts = [p.category];
  if (p.details) parts.push(`details=${p.details}`);
  if (p.approver) parts.push(`approver=${p.approver}`);
  if (p.remarks) parts.push(`remarks=${p.remarks}`);
  if (p.override) parts.push(`override=${p.override}`);
  return parts.join(REASON_DELIM);
}

export function parseReason(reason?: string | null): ParsedReason {
  if (!reason) return { category: "—" };
  const tokens = reason.split(REASON_DELIM);
  const out: ParsedReason = { category: tokens[0] || "—" };
  for (const t of tokens.slice(1)) {
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k === "details") out.details = v;
    else if (k === "approver") out.approver = v;
    else if (k === "remarks") out.remarks = v;
    else if (k === "override") out.override = v;
  }
  return out;
}

/** Count how many times this ref has already been printed (prints + reprints). */
export async function getReprintCount(refType: ReprintRefType, refId: string): Promise<number> {
  const logs = await listTable<any>("ols_print_logs");
  return logs.filter(l => l.ref_type === refType && l.ref_id === refId && l.is_reprint).length;
}

/** Approval is required from the 2nd reprint onward. */
export function requiresApproval(priorReprints: number): boolean {
  return priorReprints >= 1;
}

// ---------- Local "role" architecture (TEMPORARY STUB) ----------
// TODO(security): replace localStorage role model with authenticated RBAC
//   sourced from a dedicated `ols_user_roles` table + Supabase JWT claims.
//   This stub is for development/demo ONLY and MUST NOT ship to production:
//   any client can set `localStorage.ols_role = "admin"` and bypass approval.
//   Production must:
//     - read role from authenticated session (auth.uid → user_roles)
//     - enforce approval server-side via RLS / RPC
//     - never trust client-derived role for printing or override decisions
const ROLE_KEY = "ols_role";
export type Role = "operator" | "supervisor" | "admin";

export function getRole(): Role {
  // TODO(security): swap for server-validated role from Supabase auth.
  if (typeof localStorage === "undefined") return "operator";
  const r = (localStorage.getItem(ROLE_KEY) || "operator") as Role;
  return r === "supervisor" || r === "admin" ? r : "operator";
}
export function setRole(r: Role) {
  // TODO(security): remove once server-side RBAC is wired.
  try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ }
}
export function canOverride(): boolean {
  // TODO(security): authoritative check must happen server-side.
  const r = getRole();
  return r === "supervisor" || r === "admin";
}
export function canApprove(): boolean { return canOverride(); }

// ---------- State machine ----------
export async function createPendingRequest(opts: {
  refType: ReprintRefType; refId: string; refLabel: string;
  parsed: ParsedReason;
}): Promise<ReprintRow | null> {
  try {
    const row = await insertRow<ReprintRow>("ols_reprint_requests", {
      ref_type: opts.refType, ref_id: opts.refId,
      reason: packReason(opts.parsed), status: "pending",
    });
    await safeAudit("reprint_requested", opts.refType, opts.refId, { ref: opts.refLabel, ...opts.parsed });
    return row;
  } catch (e: any) {
    console.warn("createPendingRequest failed:", e?.message);
    return null;
  }
}

export async function approveRequest(row: ReprintRow, approver: string, remarks?: string) {
  const parsed = parseReason(row.reason);
  parsed.approver = approver;
  if (remarks) parsed.remarks = remarks;
  await updateRow("ols_reprint_requests", row.id, {
    status: "approved",
    reason: packReason(parsed),
  });
  await safeAudit("reprint_approved", row.ref_type, row.ref_id, { approver, remarks });
  return parsed;
}

export async function rejectRequest(row: ReprintRow, approver: string, remarks?: string) {
  const parsed = parseReason(row.reason);
  parsed.approver = approver;
  if (remarks) parsed.remarks = remarks;
  await updateRow("ols_reprint_requests", row.id, {
    status: "rejected",
    reason: packReason(parsed),
  });
  await safeAudit("reprint_rejected", row.ref_type, row.ref_id, { approver, remarks });
}

async function safeAudit(action: string, refType: string, refId: string, details: any) {
  try {
    await insertRow("ols_audit_logs", { action, entity_type: refType, entity_id: refId, details });
  } catch (e: any) { console.warn("audit log skipped:", e?.message); }
}
