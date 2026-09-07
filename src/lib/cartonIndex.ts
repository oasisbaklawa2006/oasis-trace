import { listTable } from "@/lib/data";
import type { Carton } from "@/lib/types";

/** Authoritative per-order carton index from current persisted cartons (not mount snapshot). */
export async function allocateNextCartonIndex(orderRef: string): Promise<number> {
  const cartons = await listTable<Carton>("ols_cartons");
  const indices = cartons
    .filter(c => c.order_ref === orderRef)
    .map(c => c.carton_index ?? 0);
  return (indices.length ? Math.max(...indices) : 0) + 1;
}
