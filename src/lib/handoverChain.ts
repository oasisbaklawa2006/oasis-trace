/**
 * Handover evidence chain resolution — links stage records via prior chainHash.
 * Server-side authenticated signing remains a Core prerequisite; this module
 * provides deterministic software-chain linking only.
 */
import { listTable } from "@/lib/data";
import type { HandoverEvidence } from "@/lib/handoverEvidence";

interface AuditLogRow {
  id: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  details?: Record<string, unknown>;
  created_at?: string;
}

function extractChainHash(details?: Record<string, unknown>): string | undefined {
  const evidence = details?.handover_evidence as HandoverEvidence | undefined;
  return evidence?.chainHash;
}

/**
 * Resolve the latest handover chainHash for an entity, or the most recent
 * handover in the audit log when no entity-specific record exists.
 */
export async function resolvePriorHandoverChainHash(
  entityType?: string,
  entityId?: string,
): Promise<string | undefined> {
  const logs = await listTable<AuditLogRow>("ols_audit_logs", { order: "created_at", limit: 100 });
  if (entityType && entityId) {
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log.entity_type === entityType && log.entity_id === entityId) {
        const hash = extractChainHash(log.details);
        if (hash) return hash;
      }
    }
  }
  for (let i = logs.length - 1; i >= 0; i--) {
    const hash = extractChainHash(logs[i].details);
    if (hash) return hash;
  }
  return undefined;
}
