import { insertRow, invokeTraceMutation } from "@/lib/data";
import { isRpcNotDeployedError } from "@/lib/rpcErrors";
import { supabaseConfigured } from "@/lib/supabase";
import type { CartonContent } from "@/lib/types";

export interface PackLabelResult {
  content: CartonContent;
  idempotencyKey: string;
}

/**
 * Governed carton-content pack — prefers Core RPC; demo uses sequential writes
 * with shared idempotency key embedded in movement reference metadata.
 */
export async function packLabelIntoCarton(
  cartonId: string,
  cartonNo: string,
  labelId: string,
): Promise<PackLabelResult> {
  const idempotencyKey = `carton-pack:${cartonId}:${labelId}`;

  if (supabaseConfigured) {
    try {
      const content = await invokeTraceMutation<CartonContent>("trace_add_carton_content_v1", {
        p_carton_id: cartonId,
        p_production_label_id: labelId,
        p_idempotency_key: idempotencyKey,
      });
      return { content, idempotencyKey };
    } catch (err: unknown) {
      if (!isRpcNotDeployedError(err)) throw err;
    }
  }

  const row = await insertRow<CartonContent>("ols_carton_contents", {
    carton_id: cartonId,
    production_label_id: labelId,
  });
  await insertRow("ols_inventory_movements", {
    production_label_id: labelId,
    from_location: "store",
    to_location: "packing",
    movement_type: "carton_pack",
    reference_no: cartonNo,
    metadata: { idempotency_key: idempotencyKey },
  });
  return { content: row, idempotencyKey };
}
