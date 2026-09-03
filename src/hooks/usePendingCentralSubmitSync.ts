import { useEffect } from "react";
import type { CentralSubmitResult } from "@/lib/centralSubmit";
import { subscribeScanSubmitResolution } from "@/lib/scanSubmitQueue";

/**
 * Sync page-local Central submit status when a queued envelope is resolved
 * by background replay (AppShell reconnect / interval flush).
 */
export function usePendingCentralSubmitSync(
  idempotencyKey: string | undefined,
  setSubmitResult: React.Dispatch<React.SetStateAction<CentralSubmitResult | null>>,
) {
  useEffect(() => {
    if (!idempotencyKey) return;
    return subscribeScanSubmitResolution((key, result) => {
      if (key !== idempotencyKey) return;
      setSubmitResult(prev => {
        if (prev?.status !== "retry_pending") return prev;
        return result;
      });
    });
  }, [idempotencyKey, setSubmitResult]);
}
