import { buildHandoverEvidence, type HandoverEvidence } from "@/lib/handoverEvidence";
import { resolvePriorHandoverChainHash } from "@/lib/handoverChain";
import { insertIdempotentHandoverAudit } from "@/lib/idempotentAudit";
import { traceMutations } from "@/lib/traceMutations";
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
  const priorHash = await resolvePriorHandoverChainHash("carton", input.carton.id);
  const evidence = await buildHandoverEvidence(
    "packing",
    "carton",
    input.carton.id,
    input.carton.carton_no,
    {
      order_ref: input.carton.order_ref,
      label_count: input.labelCount,
      net: input.net,
      gross: input.gross,
    },
    { actorId: input.actorId, priorHash },
  );

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
