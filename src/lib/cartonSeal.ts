import {
  assertAcceptedHandoverEvidence,
  resolveHandoverEvidence,
  verifyHandoverForCartonFinalize,
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
 * Seal carton via governed Core RPC with evidence-bearing finalisation.
 * Live: trace_finalize_carton_v1 (Core #259 7-arg) verifies and persists evidence atomically;
 * demo keeps separate idempotent audit insert.
 */
export async function sealCartonWithHandover(input: SealCartonInput): Promise<SealCartonResult> {
  if (supabaseConfigured && (!input.actorId || input.actorId.length === 0)) {
    throw new Error(
      "Carton seal rejected: live mode requires an authenticated actorId for Core handover signing.",
    );
  }

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
    const verified = await verifyHandoverForCartonFinalize(evidence, { priorHash });
    if (!verified) {
      throw new Error(
        "Handover evidence rejected: Core verification failed for trace_carton_finalized binding.",
      );
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

  if (!supabaseConfigured) {
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
  }

  return { carton: sealed, evidence, idempotencyKey };
}
