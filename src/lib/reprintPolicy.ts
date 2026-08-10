// Reprint approval policy. Schema is unchanged: we encode approver name +
// remarks inside `ols_reprint_requests.reason` using a delimiter, and mirror
// every state change to `ols_audit_logs.details` so we have a tamper-evident
// trail without a destructive migration.
import { listTable, insertRow, updateRow } from "@/lib/data";
import { audit } from "@/lib/audit";
import type { PrintLogRow } from "@/lib/types";

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
  const logs = await listTable<PrintLogRow>("ols_print_logs");
  return logs.filter(l => l.ref_type === refType && l.ref_id === refId && l.is_reprint).length;
}

/** Approval is required from the 2nd reprint onward. */
export function requiresApproval(priorReprints: number): boolean {
  return priorReprints >= 1;
}

// ---------- Role checks (Sprint 3) ----------
// Production: JWT `app_metadata.ols_roles` via `canApproveReprint(session)`.
// Demo-only: localStorage `ols_role` when Supabase auth is not configured.
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { canApproveReprint, getDemoFallbackRoles } from "@/lib/roles";

const ROLE_KEY = "ols_role";
export type Role = "operator" | "supervisor" | "admin";

export function getRole(): Role {
  if (supabaseConfigured) return "operator";
  if (typeof localStorage === "undefined") return "operator";
  const r = (localStorage.getItem(ROLE_KEY) || "operator") as Role;
  return r === "supervisor" || r === "admin" ? r : "operator";
}
export function setRole(r: Role) {
  if (supabaseConfigured) return;
  try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ }
}

export async function canApproveAsync(): Promise<boolean> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    return canApproveReprint(data.session);
  }
  return getDemoFallbackRoles().includes("admin") || getRole() === "admin";
}

export function canOverride(): boolean {
  if (supabaseConfigured) return false;
  const r = getRole();
  return r === "supervisor" || r === "admin";
}
/** @deprecated Use canApproveAsync() for Supabase-authenticated apps. */
export function canApprove(): boolean { return canOverride(); }

// ---------- State machine ----------
export async function createPendingRequest(opts: {
  refType: ReprintRefType; refId: string; refLabel: string;
  parsed: ParsedReason;
}): Promise<ReprintRow> {
  // Deliberately does NOT catch-and-return-null here: `ols_reprint_requests`
  // is the governance record of *why* a queued reprint was authorized. If
  // this write fails, the caller must find out (and show the operator a real
  // failure) rather than being told "queued for approval" while nothing was
  // actually persisted. See ReprintModal.tsx's confirm() for the surfacing.
  const row = await insertRow<ReprintRow>("ols_reprint_requests", {
    ref_type: opts.refType, ref_id: opts.refId,
    reason: packReason(opts.parsed), status: "pending",
  });
  // audit() never throws (it queues offline on failure) — a failed audit
  // mirror must not undo an already-durable pending request.
  await audit({
    action: "reprint_requested", entity_type: opts.refType, entity_id: opts.refId,
    details: { ref: opts.refLabel, ...opts.parsed },
  });
  return row;
}

export async function approveRequest(row: ReprintRow, approver: string, remarks?: string) {
  const parsed = parseReason(row.reason);
  parsed.approver = approver;
  if (remarks) parsed.remarks = remarks;
  await updateRow("ols_reprint_requests", row.id, {
    status: "approved",
    reason: packReason(parsed),
  });
  await audit({
    action: "reprint_approved", entity_type: row.ref_type, entity_id: row.ref_id,
    details: { approver, remarks },
  });
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
  await audit({
    action: "reprint_rejected", entity_type: row.ref_type, entity_id: row.ref_id,
    details: { approver, remarks },
  });
}
