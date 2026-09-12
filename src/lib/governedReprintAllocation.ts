import { invokeTraceMutation } from "@/lib/data";
import type { ReprintRefType } from "@/lib/reprintPolicy";

export interface GovernedReprintAllocation {
  allocation_id: string;
  ref_type: string;
  ref_id: string;
  reprint_count: number;
  approval_threshold: number;
  approval_required: boolean;
  approval_granted: boolean;
  approval_request_id: string | null;
  allowed: boolean;
  idempotency_replayed: boolean;
}

interface AllocateGovernedReprintInput {
  refType: ReprintRefType;
  refId: string;
  reason: string;
  requestId: string;
  approvalRequestId?: string | null;
}

export function reprintAllocationIdempotencyKey(requestId: string): string {
  return `trace-reprint:${requestId}`;
}

function canonicalCoreRefType(refType: ReprintRefType): string {
  return refType === "shipping" ? "shipping_label" : refType;
}

export async function allocateGovernedReprint(
  input: AllocateGovernedReprintInput,
): Promise<GovernedReprintAllocation> {
  const result = await invokeTraceMutation<GovernedReprintAllocation>(
    "trace_allocate_reprint_count_v1",
    {
      p_ref_type: input.refType,
      p_ref_id: input.refId,
      p_reason: input.reason,
      p_idempotency_key: reprintAllocationIdempotencyKey(input.requestId),
      p_approval_request_id: input.approvalRequestId ?? null,
    },
  );

  const expectedRefType = canonicalCoreRefType(input.refType);
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.allocation_id !== "string" ||
    result.allocation_id.length === 0 ||
    result.ref_type !== expectedRefType ||
    result.ref_id !== input.refId ||
    !Number.isInteger(result.reprint_count) ||
    result.reprint_count < 1 ||
    !Number.isInteger(result.approval_threshold) ||
    result.approval_threshold < 1 ||
    typeof result.allowed !== "boolean" ||
    typeof result.approval_required !== "boolean" ||
    typeof result.approval_granted !== "boolean" ||
    typeof result.idempotency_replayed !== "boolean" ||
    !(result.approval_request_id === null || typeof result.approval_request_id === "string")
  ) {
    throw new Error("Core returned an invalid or mismatched governed reprint allocation response");
  }

  return result;
}
