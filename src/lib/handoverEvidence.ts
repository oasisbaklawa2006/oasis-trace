/**
 * Immutable handover evidence — deterministic proof binding for
 * production / packing / dispatch / gate / finance stages.
 *
 * Software integrity chain (SHA-256) is demo/preview/tests only.
 * Live acceptance requires Core `trace_sign_handover_evidence_v1` (core_signed_v1).
 * Physical custody and scanner UAT remain Leap13.
 */
import { invokeTraceMutation } from "@/lib/data";
import { isRpcNotDeployedError } from "@/lib/rpcErrors";
import { supabaseConfigured } from "@/lib/supabase";
export type HandoverStage = "production" | "packing" | "dispatch" | "gate" | "finance";

export const HANDOVER_EVIDENCE_VERSION = "1.0";
export const HANDOVER_INTEGRITY_CLASS = "software_chain_v1";
/** Core-deployed authenticated evidence (server actor + timestamp binding). */
export const HANDOVER_INTEGRITY_AUTHENTICATED = "core_signed_v1";

export interface HandoverEvidence {
  version: typeof HANDOVER_EVIDENCE_VERSION;
  integrityClass: typeof HANDOVER_INTEGRITY_CLASS | typeof HANDOVER_INTEGRITY_AUTHENTICATED;
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

/** True only for Core-signed evidence — not client software_chain_v1 hashes. */
export function isAuthenticatedHandoverEvidence(evidence: HandoverEvidence): boolean {
  return evidence.integrityClass === HANDOVER_INTEGRITY_AUTHENTICATED;
}

/** Guard that evidence is software-chain class (not presented as authenticated). */
export function assertSoftwareChainEvidence(evidence: HandoverEvidence): void {
  if (evidence.integrityClass !== HANDOVER_INTEGRITY_CLASS) {
    throw new Error(`Expected software_chain_v1 evidence, got ${evidence.integrityClass}`);
  }
}

export interface ResolveHandoverEvidenceInput {
  stage: HandoverStage;
  entityType: string;
  entityId: string;
  referenceNo: string;
  metadata: Record<string, unknown>;
  actorId?: string;
  priorHash?: string;
}

/**
 * Resolve handover evidence for persistence.
 * Demo: software_chain_v1 (client hash chain).
 * Live: Core-authenticated core_signed_v1 — fails closed when signing RPC is missing.
 */
export async function resolveHandoverEvidence(
  input: ResolveHandoverEvidenceInput,
): Promise<HandoverEvidence> {
  if (!supabaseConfigured) {
    return buildHandoverEvidence(
      input.stage,
      input.entityType,
      input.entityId,
      input.referenceNo,
      input.metadata,
      { actorId: input.actorId, priorHash: input.priorHash },
    );
  }

  try {
    const evidence = await invokeTraceMutation<HandoverEvidence>(
      "trace_sign_handover_evidence_v1",
      {
        p_stage: input.stage,
        p_entity_type: input.entityType,
        p_entity_id: input.entityId,
        p_reference_no: input.referenceNo,
        p_metadata: input.metadata,
        p_actor_id: input.actorId ?? null,
        p_prior_hash: input.priorHash ?? null,
      },
    );
    if (
      evidence
      && typeof evidence === "object"
      && evidence.integrityClass === HANDOVER_INTEGRITY_AUTHENTICATED
      && typeof evidence.chainHash === "string"
      && evidence.chainHash.length > 0
    ) {
      return evidence;
    }
    throw new Error("Invalid handover evidence response from trace_sign_handover_evidence_v1");
  } catch (err: unknown) {
    if (!isRpcNotDeployedError(err)) throw err;
    throw new Error(
      "Trace operation rejected: trace_sign_handover_evidence_v1 is not deployed. "
      + "Accepted handover evidence requires Core authenticated signing.",
    );
  }
}

/** Reject client software-chain evidence when live backend is configured. */
export function assertAcceptedHandoverEvidence(evidence: HandoverEvidence): void {
  if (supabaseConfigured && !isAuthenticatedHandoverEvidence(evidence)) {
    throw new Error(
      "Handover evidence rejected: live mode requires core_signed_v1 authenticated evidence.",
    );
  }
}
