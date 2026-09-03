import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CentralPayloadPreview } from "@/components/CentralPayloadPreview";
import { listTable, insertRow, updateRow } from "@/lib/data";
import { classifyCartonBarcode } from "@/lib/scanContract";
import { processDispatchGateCtnSoScan, resolveLegacyGateDecision, type ScanFlowResult, type LegacyGateResult } from "@/lib/scanService";
import { ShieldCheck, ShieldAlert, ScanLine, Volume2, VolumeX } from "lucide-react";
import { feedback, isFeedbackEnabled, setFeedbackEnabled } from "@/lib/scanFeedback";
import { toast } from "sonner";
import { useOlsSession } from "@/hooks/useOlsSession";
import {
  submitWithOfflineRetry,
} from "@/lib/scanSubmitQueue";
import type { CentralSubmitResult } from "@/lib/centralSubmit";
import type { CentralScanSyncStatus } from "@/lib/centralScanStatus";
import type { Carton, FinancePi, GateScanRow, OrderCache, ShippingLabelRow } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export default function GateScan() {
  const [scan, setScan] = useState("");
  const [labels, setLabels] = useState<ShippingLabelRow[]>([]);
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [pis, setPis] = useState<FinancePi[]>([]);
  const [orders, setOrders] = useState<OrderCache[]>([]);
  const [history, setHistory] = useState<GateScanRow[]>([]);
  const [legacyResult, setLegacyResult] = useState<LegacyGateResult | null>(null);
  const [ctnResult, setCtnResult] = useState<ScanFlowResult | null>(null);
  const [submitResult, setSubmitResult] = useState<CentralSubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const { session, canSubmitCentral } = useOlsSession();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { reload(); inputRef.current?.focus(); }, []);
  async function reload() {
    setLabels(await listTable<ShippingLabelRow>("ols_shipping_labels"));
    setCartons(await listTable<Carton>("ols_cartons"));
    setPis(await listTable<FinancePi>("ols_finance_pi"));
    setOrders(await listTable<OrderCache>("ols_orders_cache"));
    setHistory(await listTable<GateScanRow>("ols_gate_scans", { order: "scanned_at", limit: 10 }));
  }

  async function checkLegacyShipping(ref: string) {
    try {
      setScanError(null);
      const { result: res, label: lbl, carton: ctn } = resolveLegacyGateDecision(ref, { shippingLabels: labels, cartons, pis });
      if (res.kind === "green" && ctn && lbl) {
        await updateRow("ols_cartons", ctn.id, { status: "dispatched" });
        await updateRow("ols_shipping_labels", lbl.id, { status: "dispatched" });
        await insertRow("ols_inventory_movements", {
          production_label_id: null, from_location: "shipping", to_location: "dispatched",
          movement_type: "gate_clear", reference_no: ctn.carton_no,
        });
        await insertRow("ols_audit_logs", {
          action: "gate_dispatched", entity_type: "shipping_label", entity_id: lbl.id,
          details: { carton_no: ctn.carton_no, shipping_no: lbl.shipping_no, qr_ref: ref },
        });
      }
      await insertRow("ols_gate_scans", { qr_ref: ref, shipping_label_id: lbl?.id, result: res.kind, reason: res.reason });
      await insertRow("ols_scan_history", {
        scan_value: ref, scan_context: "gate_shipping_qr", result: res.kind,
        metadata: { reason: res.reason || null, legacy_flow: true },
      });
      if (res.kind === "red") {
        await insertRow("ols_audit_logs", {
          action: "gate_hold", entity_type: "shipping_label", entity_id: lbl?.id,
          details: { qr_ref: ref, reason: res.reason },
        });
      }
      feedback(res.kind === "green" ? "ok" : (res.title === "DUPLICATE" ? "dup" : "error"));
      setLegacyResult(res);
      setCtnResult(null);
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to record scan");
      setScanError(msg);
      toast.error(msg, { duration: Infinity });
      feedback("error");
      throw err;
    }
  }

  async function check() {
    try {
      setScanError(null);
      const ref = scan.trim();
      if (!ref) return;

      const kind = classifyCartonBarcode(ref);
      setLegacyResult(null);
      setCtnResult(null);
      setSubmitResult(null);

      if (kind === "central") {
        const flow = await processDispatchGateCtnSoScan(ref, orders, { cartons, shippingLabels: labels });
        setCtnResult(flow);
        setSubmitResult(null);
        if (flow.duplicate) {
          feedback("dup");
          toast.warning(flow.userMessage);
        } else if (flow.ok) {
          feedback("ok");
          toast.success(flow.userMessage);
        } else {
          feedback("error");
          toast.error(flow.userMessage);
        }
        setScan("");
        reload();
        inputRef.current?.focus();
        return;
      }

      if (kind === "legacy") {
        feedback("error");
        toast.error("Barcode format invalid", {
          description: "Legacy CTN-YYYYMMDD barcodes use shipping QR at gate. Scan CTN-SO-* for Central gate check.",
        });
        setScan("");
        inputRef.current?.focus();
        return;
      }

      // Shipping QR / other refs — legacy gate flow
      await checkLegacyShipping(ref);
      setScan("");
      reload();
      inputRef.current?.focus();
    } catch (err: unknown) {
      const msg = errorMessage(err, "Scan failed");
      setScanError(msg);
      toast.error(msg, { duration: Infinity });
    }
  }


  const syncStatus: CentralScanSyncStatus =
    submitResult?.status ?? ctnResult?.centralSyncStatus ?? "preview_only";

  async function handleSubmitCentral() {
    if (!ctnResult?.payload || !ctnResult.idempotencyKey) return;
    setSubmitting(true);
    const r = await submitWithOfflineRetry({
      idempotencyKey: ctnResult.idempotencyKey,
      payload: ctnResult.payload as unknown as Record<string, unknown>,
      scanHistoryId: ctnResult.scanHistoryId,
      session,
    });
    setSubmitResult(r);
    setSubmitting(false);
    if (r.ok) toast.success(r.message);
    else if (r.duplicate) toast.warning(r.message);
    else if (r.queued) toast.info(r.message);
    else toast.error(r.message);
  }

  async function handleRetryCentral() {
    if (!ctnResult?.payload || !ctnResult.idempotencyKey) return;
    setSubmitting(true);
    const r = await submitWithOfflineRetry({
      idempotencyKey: ctnResult.idempotencyKey,
      payload: ctnResult.payload as unknown as Record<string, unknown>,
      scanHistoryId: ctnResult.scanHistoryId,
      session,
    });
    setSubmitResult(r);
    setSubmitting(false);
    if (r.ok) toast.success(r.message);
    else if (r.queued) toast.info(r.message);
    else toast.error(r.message);
  }

  const fastScan = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const showGreen = ctnResult?.ok || legacyResult?.kind === "green";
  const showRed = (ctnResult && !ctnResult.ok) || legacyResult?.kind === "red";

  return (
    <div className={fastScan ? "ols-fast-scan" : undefined}>
      <PageHeader
        eyebrow="Security"
        title="Exit Gate Scan Control"
        description="Scan CTN-SO order barcode for Central gate proof, or shipping QR for legacy dispatch clearance."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="ols-card p-6 lg:col-span-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef} value={scan} onChange={e => setScan(e.target.value)}
              onKeyDown={e => e.key === "Enter" && check()}
              placeholder="Scan CTN-SO-* or shipping QR…"
              aria-label="Gate scan barcode input"
              className="h-14 font-mono text-lg"
            />
            <Button onClick={check} className="h-14 px-6 bg-gradient-primary text-primary-foreground"><ScanLine size={20} /></Button>
            <Button variant="outline" className="h-14 px-3" onClick={() => { setFeedbackEnabled(!isFeedbackEnabled()); location.reload(); }} title="Toggle scan beep + vibration">
              {isFeedbackEnabled() ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </Button>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Central gate: <span className="font-mono">CTN-SO-2026-000136</span> · Legacy: shipping QR / <span className="font-mono">CTN-YYYYMMDD-####</span> on carton only
          </p>

          {scanError && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <strong>Scan failed:</strong> {scanError}
            </div>
          )}

          <div
            role="status"
            aria-live="polite"
            className={`mt-6 rounded-2xl border-2 p-8 text-center transition-all ${
              !ctnResult && !legacyResult ? "border-dashed border-border bg-surface-muted/30" :
              showGreen ? "border-success bg-success/10" : "border-destructive bg-destructive/10"
            }`}
          >
            {!ctnResult && !legacyResult ? (
              <p className="text-sm text-muted-foreground">Awaiting scan…</p>
            ) : showGreen ? (
              <div className="text-success">
                <ShieldCheck size={64} className="mx-auto mb-2" />
                <p className="text-3xl font-bold tracking-wide">
                  {ctnResult?.userMessage || `GREEN — ${legacyResult?.title}`}
                </p>
                {legacyResult?.ref && <p className="mt-1 text-sm">Carton {legacyResult.ref} marked dispatched.</p>}
              </div>
            ) : (
              <div className="text-destructive">
                <ShieldAlert size={64} className="mx-auto mb-2" />
                <p className="text-3xl font-bold tracking-wide">
                  {ctnResult?.userMessage || `RED — ${legacyResult?.title}`}
                </p>
                {legacyResult?.reason && <p className="mt-1 text-sm">{legacyResult.reason}</p>}
              </div>
            )}
          </div>

          <CentralPayloadPreview
            title="Central dispatch_gate payload"
            payload={ctnResult?.payload ?? null}
            idempotencyKey={ctnResult?.idempotencyKey}
            readyForCentral={!!ctnResult?.readyForCentral}
            userMessage={ctnResult?.userMessage}
            syncStatus={syncStatus}
            canSubmit={canSubmitCentral}
            submitDisabledReason={
              !canSubmitCentral ? "Dispatch or security role required (JWT ols_roles)" : undefined
            }
            onSubmitToCentral={handleSubmitCentral}
            onRetry={handleRetryCentral}
            submitting={submitting}
            centralReference={submitResult?.centralReference}
            submittedAt={submitResult?.submittedAt}
            failureReason={submitResult?.failureReason}
          />
        </div>

        <div className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Last 10 scans</h3>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="space-y-1.5">
              {history.map(h => (
                <li key={h.id} className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs ${h.result === "green" ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
                  <span className="font-mono">{(h.qr_ref || "").slice(0, 20)}</span>
                  <span className="font-semibold uppercase">{h.result}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
