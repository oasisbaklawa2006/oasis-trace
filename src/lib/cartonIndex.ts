import { getMode, invokeTraceMutation, listTable } from "@/lib/data";
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
 * Prefers Core RPC when deployed; otherwise reads live cartons only (no demo fallback).
 */
export async function allocateNextCartonIndex(orderRef: string): Promise<number> {
  if (supabaseConfigured) {
    try {
      const index = await invokeTraceMutation<number>("trace_allocate_carton_index_v1", {
        p_order_ref: orderRef,
      });
      if (typeof index === "number" && index > 0) return index;
    } catch (err: unknown) {
      if (!isRpcNotDeployedError(err)) throw err;
    }

    const cartons = await listTable<Carton>("ols_cartons");
    if (getMode() !== "live") {
      throw new Error("Cannot allocate carton index from non-authoritative data source.");
    }
    return maxCartonIndexForOrder(cartons, orderRef) + 1;
  }

  const cartons = await listTable<Carton>("ols_cartons");
  return maxCartonIndexForOrder(cartons, orderRef) + 1;
}
