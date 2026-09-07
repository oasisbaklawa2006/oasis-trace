import { errorMessage } from "@/lib/utils";

const MISSING_FUNCTION_RE = /function\s+[\w.]+\(\)\s+does not exist/;

/** True when a Core RPC is missing or not yet deployed — safe to use guarded client fallback in demo. */
export function isRpcNotDeployedError(err: unknown): boolean {
  const msg = errorMessage(err, "").toLowerCase();
  const functionMissing =
    MISSING_FUNCTION_RE.test(msg)
    || msg.includes("could not find the function")
    || msg.includes("unknown function");
  if (functionMissing) return true;
  return msg.includes("trace operation rejected")
    && (msg.includes("could not find the function") || MISSING_FUNCTION_RE.test(msg));
}
