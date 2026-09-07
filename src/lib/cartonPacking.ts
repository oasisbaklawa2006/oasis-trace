import { insertRow, listTable } from "@/lib/data";
import { isRpcNotDeployedError } from "@/lib/rpcErrors";
import { supabaseConfigured } from "@/lib/supabase";
import { traceMutations } from "@/lib/traceMutations";
import type { CartonContent } from "@/lib/types";

export interface PackLabelResult {
  content: CartonContent;
  idempotencyKey: string;
}

interface InventoryMovementRow {
  production_label_id?: string;
  movement_type?: string;
  metadata?: { idempotency_key?: string };
}

async function demoPackLabelIntoCarton(
  cartonId: string,
  cartonNo: string,
  labelId: string,
  idempotencyKey: string,
): Promise<PackLabelResult> {
  const [contents, movements] = await Promise.all([
    listTable<CartonContent>("ols_carton_contents"),
    listTable<InventoryMovementRow>("ols_inventory_movements"),
  ]);
  const existing = contents.find(c => c.carton_id === cartonId && c.production_label_id === labelId);
  const hasMovement = movements.some(
    m => m.production_label_id === labelId
      && m.movement_type === "carton_pack"
      && m.metadata?.idempotency_key === idempotencyKey,
  );
  if (existing) {
    if (!hasMovement) {
      await insertRow("ols_inventory_movements", {
        production_label_id: labelId,
        from_location: "store",
        to_location: "packing",
        movement_type: "carton_pack",
        reference_no: cartonNo,
        metadata: { idempotency_key: idempotencyKey },
      });
    }
    return { content: existing, idempotencyKey };
  }

  const row = await insertRow<CartonContent>("ols_carton_contents", {
    carton_id: cartonId,
    production_label_id: labelId,
  });
  try {
    await insertRow("ols_inventory_movements", {
      production_label_id: labelId,
      from_location: "store",
      to_location: "packing",
      movement_type: "carton_pack",
      reference_no: cartonNo,
      metadata: { idempotency_key: idempotencyKey },
    });
  } catch (err: unknown) {
    if (!hasMovement) throw err;
  }
  return { content: row, idempotencyKey };
}

/**
 * Governed carton-content pack — prefers Core RPC; demo uses idempotent
 * sequential writes with shared idempotency key embedded in movement metadata.
 */
export async function packLabelIntoCarton(
  cartonId: string,
  cartonNo: string,
  labelId: string,
): Promise<PackLabelResult> {
  const idempotencyKey = `carton-pack:${cartonId}:${labelId}`;

  if (supabaseConfigured) {
    try {
      const content = await traceMutations.addCartonContent(cartonId, labelId, idempotencyKey);
      return { content, idempotencyKey };
    } catch (err: unknown) {
      if (!isRpcNotDeployedError(err)) throw err;
    }
  }

  return demoPackLabelIntoCarton(cartonId, cartonNo, labelId, idempotencyKey);
}
