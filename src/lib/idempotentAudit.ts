import { insertRow, invokeTraceMutation, isDuplicateError, listTable } from "@/lib/data";
import { withAsyncLock } from "@/lib/asyncLock";
import { assertAcceptedHandoverEvidence, type HandoverEvidence } from "@/lib/handoverEvidence";
import { isRpcNotDeployedError } from "@/lib/rpcErrors";
import { supabaseConfigured } from "@/lib/supabase";

interface AuditLogRow {
  id: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  details?: Record<string, unknown>;
}

/** Skip or no-op when an audit row with the same idempotency key already exists.
 *  Live: trace_insert_handover_audit_v1 with Core DB uniqueness on
 *  (details->>'idempotency_key', entity_id) — bounded read below is demo-only. */
export async function insertIdempotentHandoverAudit(
  row: {
    action: string;
    entity_type: string;
    entity_id: string;
    details: Record<string, unknown> & { handover_evidence: HandoverEvidence; idempotency_key: string };
  },
): Promise<void> {
  const key = row.details.idempotency_key;

  if (supabaseConfigured) {
    assertAcceptedHandoverEvidence(row.details.handover_evidence);
    try {
      await invokeTraceMutation("trace_insert_handover_audit_v1", {
        p_action: row.action,
        p_entity_type: row.entity_type,
        p_entity_id: row.entity_id,
        p_details: row.details,
        p_idempotency_key: key,
      });
      return;
    } catch (err: unknown) {
      if (!isRpcNotDeployedError(err)) throw err;
      throw new Error(
        "Trace operation rejected: trace_insert_handover_audit_v1 is not deployed. "
        + "Audit idempotency requires Core DB-enforced uniqueness.",
      );
    }
  }

  await withAsyncLock(`handover-audit:${key}:${row.entity_id}`, async () => {
    const recent = await listTable<AuditLogRow>("ols_audit_logs", { order: "created_at", limit: 200 });
    const exists = recent.some(
      log => log.details?.idempotency_key === key && log.entity_id === row.entity_id,
    );
    if (exists) return;
    try {
      await insertRow("ols_audit_logs", row);
    } catch (err: unknown) {
      if (isDuplicateError(err)) return;
      throw err;
    }
  });
}
