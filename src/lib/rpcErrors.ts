import { errorMessage } from "@/lib/utils";

/** True when a Core RPC is missing or not yet deployed — safe to use guarded client fallback in demo. */
export function isRpcNotDeployedError(err: unknown): boolean {
  const msg = errorMessage(err, "").toLowerCase();
  return (
    msg.includes("does not exist")
    || msg.includes("could not find the function")
    || msg.includes("unknown function")
    || msg.includes("permission denied for function")
    || (msg.includes("trace operation rejected")
      && (msg.includes("does not exist") || msg.includes("could not find")))
  );
}
