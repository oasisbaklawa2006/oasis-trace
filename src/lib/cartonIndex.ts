import { invokeTraceMutation, listTable } from "@/lib/data";
import { isRpcNotDeployedError } from "@/lib/rpcErrors";
import { supabaseConfigured } from "@/lib/supabase";
import type { Carton } from "@/lib/types";

function maxCartonIndexForOrder(cartons: Carton[], orderRef: string): number {
  const indices = cartons
    .filter(c => c.order_ref === orderRef)
    .map(c => c.carton_index ?? 0);
  return indices.length ? Math.max(...indices) : 0;
}

/**
 * Allocate the next per-order carton index from authoritative server state.
 * Live mode requires Core trace_allocate_carton_index_v1 (Core #259); demo uses local max+1.
 */
export async function allocateNextCartonIndex(orderRef: string): Promise<number> {
  if (supabaseConfigured) {
    try {
      const index = await invokeTraceMutation<number>("trace_allocate_carton_index_v1", {
        p_order_ref: orderRef,
      });
      if (typeof index === "number" && index > 0) return index;
      throw new Error(
        "Trace operation rejected: trace_allocate_carton_index_v1 returned non-authoritative index.",
      );
    } catch (err: unknown) {
      if (!isRpcNotDeployedError(err)) throw err;
      throw new Error(
        "Trace operation rejected: trace_allocate_carton_index_v1 is not deployed. "
        + "Live carton index allocation requires Core authority (Core #259 / Production Migration Release #161).",
      );
    }
  }

  const cartons = await listTable<Carton>("ols_cartons");
  return maxCartonIndexForOrder(cartons, orderRef) + 1;
}
