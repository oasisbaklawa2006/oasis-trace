/**
 * Immutable handover evidence — deterministic proof binding for
 * production / packing / dispatch / gate / finance stages.
 *
 * Software integrity chain (SHA-256). Authenticated server signing is a
 * Core prerequisite — client hashes are tamper-evident, not tamper-proof.
 * Physical custody and scanner UAT remain Leap13.
 */
export type HandoverStage = "production" | "packing" | "dispatch" | "gate" | "finance";

export const HANDOVER_EVIDENCE_VERSION = "1.0";
export const HANDOVER_INTEGRITY_CLASS = "software_chain_v1";

export interface HandoverEvidence {
  version: typeof HANDOVER_EVIDENCE_VERSION;
  integrityClass: typeof HANDOVER_INTEGRITY_CLASS;
  stage: HandoverStage;
  entityType: string;
  entityId: string;
  referenceNo: string;
  actorId?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
  contentHash: string;
  chainHash: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildHandoverEvidence(
  stage: HandoverStage,
  entityType: string,
  entityId: string,
  referenceNo: string,
  metadata: Record<string, unknown>,
  opts?: { actorId?: string; priorHash?: string },
): Promise<HandoverEvidence> {
  const occurredAt = new Date().toISOString();
  const content = JSON.stringify({
    stage,
    entityType,
    entityId,
    referenceNo,
    metadata,
    occurredAt,
    actorId: opts?.actorId ?? null,
  });
  const contentHash = await sha256Hex(content);
  const chainInput = `${opts?.priorHash ?? "origin"}|${contentHash}`;
  const chainHash = await sha256Hex(chainInput);
  return {
    version: HANDOVER_EVIDENCE_VERSION,
    integrityClass: HANDOVER_INTEGRITY_CLASS,
    stage,
    entityType,
    entityId,
    referenceNo,
    actorId: opts?.actorId,
    occurredAt,
    metadata,
    contentHash,
    chainHash,
  };
}

/** Recompute chain hash from evidence fields — verifies integrity. */
export async function verifyHandoverEvidence(
  evidence: HandoverEvidence,
  priorHash?: string,
): Promise<boolean> {
  const content = JSON.stringify({
    stage: evidence.stage,
    entityType: evidence.entityType,
    entityId: evidence.entityId,
    referenceNo: evidence.referenceNo,
    metadata: evidence.metadata,
    occurredAt: evidence.occurredAt,
    actorId: evidence.actorId ?? null,
  });
  const contentHash = await sha256Hex(content);
  if (contentHash !== evidence.contentHash) return false;
  const chainInput = `${priorHash ?? "origin"}|${contentHash}`;
  const chainHash = await sha256Hex(chainInput);
  return chainHash === evidence.chainHash;
}
