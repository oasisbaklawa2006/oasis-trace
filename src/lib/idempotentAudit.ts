import { insertRow, isDuplicateError, listTable } from "@/lib/data";
import type { HandoverEvidence } from "@/lib/handoverEvidence";

interface AuditLogRow {
  id: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  details?: Record<string, unknown>;
}

/** Skip or no-op when an audit row with the same idempotency key already exists.
 *  Core should enforce uniqueness on (details->>'idempotency_key', entity_id). */
export async function insertIdempotentHandoverAudit(
  row: {
    action: string;
    entity_type: string;
    entity_id: string;
    details: Record<string, unknown> & { handover_evidence: HandoverEvidence; idempotency_key: string };
  },
): Promise<void> {
  const key = row.details.idempotency_key;
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
}
