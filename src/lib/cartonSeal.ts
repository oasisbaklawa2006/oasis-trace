import {
  assertAcceptedHandoverEvidence,
  resolveHandoverEvidence,
  verifyAcceptedHandoverEvidence,
  type HandoverEvidence,
} from "@/lib/handoverEvidence";
import { resolvePriorHandoverChainHash } from "@/lib/handoverChain";
import { insertIdempotentHandoverAudit } from "@/lib/idempotentAudit";
import { traceMutations } from "@/lib/traceMutations";
import { supabaseConfigured } from "@/lib/supabase";
import type { Carton } from "@/lib/types";

export interface SealCartonInput {
  carton: Carton;
  net: number;
  gross: number;
  copiedToClipboard: boolean;
  labelCount: number;
  actorId?: string;
}

export interface SealCartonResult {
  carton: Carton;
  evidence: HandoverEvidence;
  idempotencyKey: string;
}

/**
 * Seal carton via governed Core RPC and persist idempotent handover audit.
 * Core may absorb evidence atomically when `p_handover_evidence` is deployed.
 */
export async function sealCartonWithHandover(input: SealCartonInput): Promise<SealCartonResult> {
  const idempotencyKey = `finalize-carton:${input.carton.id}`;
  const priorHash = await resolvePriorHandoverChainHash("carton", input.carton.id, { scopedOnly: true });
  const evidence = await resolveHandoverEvidence({
    stage: "packing",
    entityType: "carton",
    entityId: input.carton.id,
    referenceNo: input.carton.carton_no,
    metadata: {
      order_ref: input.carton.order_ref,
      label_count: input.labelCount,
      net: input.net,
      gross: input.gross,
    },
    actorId: input.actorId,
    priorHash,
  });
  assertAcceptedHandoverEvidence(evidence);

  if (supabaseConfigured) {
    const verified = await verifyAcceptedHandoverEvidence(evidence, { priorHash });
    if (!verified) {
      throw new Error("Handover evidence rejected: Core verification failed for core_signed_v1 evidence.");
    }
  }

  const sealed = await traceMutations.finalizeCarton(
    input.carton.id,
    input.net,
    input.gross,
    input.copiedToClipboard,
    idempotencyKey,
    { handoverEvidence: evidence, actorId: input.actorId },
  );

  await insertIdempotentHandoverAudit({
    action: "carton_sealed",
    entity_type: "carton",
    entity_id: input.carton.id,
    details: {
      carton_no: input.carton.carton_no,
      handover_evidence: evidence,
      idempotency_key: idempotencyKey,
    },
  });

  return { carton: sealed, evidence, idempotencyKey };
}
