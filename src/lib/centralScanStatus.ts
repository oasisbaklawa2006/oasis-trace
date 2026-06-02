/** Central scan sync lifecycle (stored in scan history metadata + submissions table). */
export type CentralScanSyncStatus =
  | "preview_only"
  | "ready_to_submit"
  | "submitted"
  | "failed"
  | "retry_pending";

export function isVerifiedReadyStatus(status: CentralScanSyncStatus | undefined): boolean {
  return status === "ready_to_submit" || status === "retry_pending" || status === "failed";
}

export function statusLabel(status: CentralScanSyncStatus | undefined): string {
  switch (status) {
    case "preview_only": return "Preview only";
    case "ready_to_submit": return "Ready to submit";
    case "submitted": return "Submitted to Central";
    case "failed": return "Submit failed";
    case "retry_pending": return "Retry pending";
    default: return "Unknown";
  }
}
