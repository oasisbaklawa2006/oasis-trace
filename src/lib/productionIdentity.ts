import { invokeTraceMutation } from "@/lib/data";
import {
  allocateTraceIdentity,
  type TraceAllocatableKind,
} from "@/lib/barcodeIdentity";
import { isRpcNotDeployedError } from "@/lib/rpcErrors";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * Authoritative production identity allocation.
 * Live mode requires Core RPC; client allocator is demo/preview/tests only.
 */
export async function allocateProductionIdentity(kind: TraceAllocatableKind): Promise<string> {
  if (supabaseConfigured) {
    try {
      const id = await invokeTraceMutation<string>("trace_allocate_identity_v1", { p_kind: kind });
      if (typeof id === "string" && id.length > 0) return id;
      throw new Error("Invalid identity response from trace_allocate_identity_v1");
    } catch (err: unknown) {
      if (!isRpcNotDeployedError(err)) throw err;
      throw new Error(
        "Trace operation rejected: trace_allocate_identity_v1 is not deployed. "
        + "Production identities require Core authoritative allocation.",
      );
    }
  }
  return allocateTraceIdentity(kind);
}
