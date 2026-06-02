import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import type { CentralScanSyncStatus } from "@/lib/centralScanStatus";
import { statusLabel } from "@/lib/centralScanStatus";
import { isCentralSubmitEnabled } from "@/lib/centralSubmit";

interface Props {
  title?: string;
  payload: object | null;
  idempotencyKey?: string;
  readyForCentral: boolean;
  userMessage?: string;
  syncStatus?: CentralScanSyncStatus;
  canSubmit?: boolean;
  submitDisabledReason?: string;
  onSubmitToCentral?: () => Promise<void>;
  onRetry?: () => Promise<void>;
  submitting?: boolean;
  centralReference?: string;
  submittedAt?: string;
  failureReason?: string;
}

export function CentralPayloadPreview({
  title = "Central scan payload",
  payload,
  idempotencyKey,
  readyForCentral,
  userMessage,
  syncStatus = "preview_only",
  canSubmit = false,
  submitDisabledReason,
  onSubmitToCentral,
  onRetry,
  submitting = false,
  centralReference,
  submittedAt,
  failureReason,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!payload && !idempotencyKey) return null;

  const json = payload ? JSON.stringify(payload, null, 2) : "";
  const submitEnabled = isCentralSubmitEnabled();
  const showSubmit =
    readyForCentral &&
    syncStatus !== "submitted" &&
    onSubmitToCentral &&
    isCentralSubmitEnabled();
  const showRetry =
    (syncStatus === "failed" || syncStatus === "retry_pending") &&
    onRetry &&
    isCentralSubmitEnabled();

  async function copyJson() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success("Payload JSON copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="mt-4 rounded-xl border bg-muted/30 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{statusLabel(syncStatus)}</Badge>
          {readyForCentral && syncStatus === "ready_to_submit" && (
            <Badge className="bg-success/15 text-success hover:bg-success/20">Ready for Central sync</Badge>
          )}
          {syncStatus === "submitted" && (
            <Badge className="bg-primary/15 text-primary">Submitted</Badge>
          )}
        </div>
      </div>
      {userMessage && <p className="mb-2 text-xs text-muted-foreground">{userMessage}</p>}
      {idempotencyKey && (
        <p className="mb-2 break-all font-mono text-[11px] text-muted-foreground">
          Idempotency key: <span className="text-foreground">{idempotencyKey}</span>
        </p>
      )}
      {centralReference && (
        <p className="mb-1 text-xs">
          Central reference: <span className="font-mono">{centralReference}</span>
        </p>
      )}
      {submittedAt && (
        <p className="mb-2 text-xs text-muted-foreground">
          Submitted: {new Date(submittedAt).toLocaleString()}
        </p>
      )}
      {failureReason && (
        <p className="mb-2 text-xs text-destructive">Failure: {failureReason}</p>
      )}
      {json && (
        <>
          <pre className="max-h-56 overflow-auto rounded-lg border bg-background p-3 text-[11px] leading-relaxed">
            {json}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copyJson}>
              {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
              Copy JSON
            </Button>
            {showSubmit && (
              <Button
                type="button"
                size="sm"
                disabled={!canSubmit || submitting}
                onClick={onSubmitToCentral}
                title={submitDisabledReason}
              >
                <Upload size={14} className="mr-1" />
                {submitting ? "Submitting…" : "Submit to Central"}
              </Button>
            )}
            {showRetry && (
              <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={onRetry}>
                <RefreshCw size={14} className="mr-1" />
                Retry
              </Button>
            )}
          </div>
        </>
      )}
      {!submitEnabled && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Preview mode — enable <code className="text-[10px]">VITE_CENTRAL_SCAN_SUBMIT_ENABLED=true</code> to show submit controls.
        </p>
      )}
      {submitEnabled && submitDisabledReason && showSubmit && (
        <p className="mt-2 text-[10px] text-warning-foreground/80">{submitDisabledReason}</p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Local preview is always available. Submit uses a signed server-side edge function — no secrets in the browser.
      </p>
    </div>
  );
}
