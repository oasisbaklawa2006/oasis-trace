// Centralized audit logger.
//
// All security-sensitive actions (print, reprint, approve, reject, gate clear,
// gate block, dispatch release, traceability lookup, manual override) MUST go
// through `audit()`. Inserts are append-only into `ols_audit_logs`.
//
// Frontend can never DELETE — there is no `deleteRow("ols_audit_logs")` call
// anywhere. Production hardening must additionally enforce this server-side:
//
//   TODO(security, prod): add RLS policy
//     CREATE POLICY "audit_no_delete" ON ols_audit_logs FOR DELETE USING (false);
//     CREATE POLICY "audit_no_update" ON ols_audit_logs FOR UPDATE USING (false);
//     CREATE POLICY "audit_insert_authenticated" ON ols_audit_logs
//       FOR INSERT TO authenticated WITH CHECK (true);
//   (Already covered conceptually by db/ols_enable_rls_authenticated.sql but
//   the no-update / no-delete policies must be added explicitly.)
//
// Offline behavior: if the live insert fails for any reason we enqueue the
// payload via offlineQueue so the audit trail is eventually consistent.

import { insertRow } from "@/lib/data";
import { enqueue, registerHandler } from "@/lib/offlineQueue";

export type AuditAction =
  | "print" | "reprint" | "reprint_requested" | "reprint_approved" | "reprint_rejected"
  | "reprint_override" | "reprint_immediate"
  | "gate_clear" | "gate_block" | "gate_duplicate"
  | "dispatch_release" | "dispatch_recall"
  | "trace_lookup" | "manual_override"
  | "pi_clear" | "pi_revert" | "dpl_finalize"
  | (string & {});

export interface AuditPayload {
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  details?: any;
  /** Optional actor identifier (email / user id when known). */
  actor?: string;
}

const QUEUE_KIND = "audit_log";

registerHandler(QUEUE_KIND, async (payload: AuditPayload) => {
  await insertRow("ols_audit_logs", payload);
});

/**
 * Append an immutable audit entry. Never throws — if the write fails we
 * queue it offline and surface a console warning. Callers should treat audit
 * as fire-and-forget.
 */
export async function audit(p: AuditPayload): Promise<void> {
  try {
    await insertRow("ols_audit_logs", {
      action: p.action,
      entity_type: p.entity_type,
      entity_id: p.entity_id,
      details: p.details,
    });
  } catch (e: any) {
    console.warn("[audit] live insert failed, queued:", e?.message);
    enqueue(QUEUE_KIND, p);
  }
}
