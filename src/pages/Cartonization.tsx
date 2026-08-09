import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CentralPayloadPreview } from "@/components/CentralPayloadPreview";
import { listTable, insertRow, updateRow } from "@/lib/data";
import { num } from "@/lib/numbering";
import { buildCartonMetadata, resolveCartonBarcodeDisplay } from "@/lib/barcodeCarton";
import { supportsCentralBarcode } from "@/lib/scanContract";
import { processCartonIdentityScan, type ScanFlowResult } from "@/lib/scanService";
import { LabelPreview } from "@/components/LabelPreview";
import { ScanBarcode, PackagePlus, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/StatusPill";
import { feedback } from "@/lib/scanFeedback";
import { useOlsSession } from "@/hooks/useOlsSession";
import {
  submitCentralScan,
  retryCentralScan,
  type CentralSubmitResult,
} from "@/lib/centralSubmit";
import type { CentralScanSyncStatus } from "@/lib/centralScanStatus";
import type { Carton, CartonContent, OrderCache, ProductionLabel } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { generateLabelCommand, recordLabelGenerated, NO_PHYSICAL_PRINT_NOTE } from "@/lib/labelPrintLog";
import { buildCartonLabelPayload } from "@/lib/labelPayloads";
import { insertWithUniqueRetry } from "@/lib/insertWithRetry";

interface CartonContentWithLabel extends CartonContent {
  label?: ProductionLabel;
}

export default function Cartonization() {
  const [orders, setOrders] = useState<OrderCache[]>([]);
  const [labels, setLabels] = useState<ProductionLabel[]>([]);
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const [orderRef, setOrderRef] = useState("");
  const [carton, setCarton] = useState<Carton | null>(null);
  const [contents, setContents] = useState<CartonContentWithLabel[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [identityScan, setIdentityScan] = useState("");
  const [identityResult, setIdentityResult] = useState<ScanFlowResult | null>(null);
  const [submitResult, setSubmitResult] = useState<CentralSubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cartonError, setCartonError] = useState<string | null>(null);
  const { session, canSubmitCentral } = useOlsSession();
  const [recentCartons, setRecentCartons] = useState<Carton[]>([]);

  const barcodeDisplay = carton
    ? resolveCartonBarcodeDisplay(carton.order_ref || "", carton.carton_no, carton.metadata)
    : orderRef
      ? resolveCartonBarcodeDisplay(orderRef, undefined, supportsCentralBarcode(orderRef) ? { central_barcode: undefined } : undefined)
      : null;

  useEffect(() => { (async () => {
    setOrders(await listTable<OrderCache>("ols_orders_cache"));
    const lbls = await listTable<ProductionLabel>("ols_production_labels");
    setLabels(lbls);
    const cc = await listTable<CartonContent>("ols_carton_contents");
    setPacked(new Set(cc.filter(c => c.production_label_id).map(c => c.production_label_id!)));
    setRecentCartons(await listTable<Carton>("ols_cartons", { order: "created_at", limit: 6 }));
  })(); }, []);

  async function startCarton() {
    try {
      setCartonError(null);
      if (!orderRef) { toast.error("Pick an order first"); return; }
      const order = orders.find(o => o.order_number === orderRef);
      // carton_no is randomly generated (numbering.ts) and can collide under
      // concurrent multi-terminal use — retry with a fresh id (and matching
      // metadata) on a confirmed unique-constraint violation, bounded.
      const c = await insertWithUniqueRetry<Carton>("ols_cartons", () => {
        const legacyNo = num.carton();
        return {
          carton_no: legacyNo,
          order_ref: orderRef,
          customer_code: order?.customer_code,
          customer_name: order?.customer_name,
          status: "draft",
          carton_index: (recentCartons.filter(r => r.order_ref === orderRef).length) + 1,
          metadata: buildCartonMetadata(orderRef, legacyNo),
        };
      });
      setCarton(c);
      setContents([]);
      setIdentityResult(null);
      setSubmitResult(null);
      const display = resolveCartonBarcodeDisplay(orderRef, c.carton_no, c.metadata);
      if (display.centralBarcode) {
        toast.success(`Carton started · Central barcode ${display.centralBarcode}`);
      } else {
        toast.success(`Carton ${c.carton_no} created (legacy/local barcode)`);
      }
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to create carton");
      setCartonError(msg);
      toast.error(msg, { duration: Infinity });
    }
  }

  async function verifyCartonIdentity() {
    try {
      setCartonError(null);
      const code = identityScan.trim();
      if (!code || !carton) return;
      const flow = await processCartonIdentityScan(code, carton.order_ref || "", orders);
      setIdentityResult(flow);
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
      setIdentityScan("");
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to verify carton identity");
      setCartonError(msg);
      toast.error(msg, { duration: Infinity });
    }
  }

  async function scanLabel() {
    try {
      setCartonError(null);
      const code = scanInput.trim();
      if (!code || !carton) return;
      const lbl = labels.find(l => l.label_no === code);
      if (!lbl) { feedback("error"); toast.error("Label not found", { description: "Use manual add if needed." }); return; }
      if (packed.has(lbl.id)) { feedback("dup"); toast.error("Duplicate scan blocked", { description: "Label already in another active carton." }); return; }
      const row = await insertRow<CartonContent>("ols_carton_contents", { carton_id: carton.id, production_label_id: lbl.id });
      await insertRow("ols_inventory_movements", {
        production_label_id: lbl.id, from_location: "store", to_location: "packing",
        movement_type: "carton_pack", reference_no: carton.carton_no,
      });
      setContents(c => [...c, { ...row, label: lbl }]);
      setPacked(p => new Set(p).add(lbl.id));
      setScanInput("");
      feedback("ok");
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to add label to carton");
      setCartonError(msg);
      toast.error(msg, { duration: Infinity });
    }
  }

  async function finalizeCarton() {
    try {
      setCartonError(null);
      if (!carton || contents.length === 0) { toast.error("Add at least one label"); return; }
      if (supportsCentralBarcode(carton.order_ref || "") && !identityResult?.ok) {
        toast.error("Verify Central carton identity first", {
          description: "Scan the CTN-SO barcode before packing.",
        });
        return;
      }
      const net = contents.reduce((s, c) => s + (c.label?.net_weight || 0), 0);
      const gross = contents.reduce((s, c) => s + (c.label?.gross_weight || 0), 0);
      await updateRow("ols_cartons", carton.id, {
        status: "packed", packed_at: new Date().toISOString(),
        net_weight: net, gross_weight: gross,
      });
      // Generate the TSPL command (proves GENERATED); best-effort clipboard
      // copy. This is NOT a physical print — see labelPrintLog.ts header.
      const { copiedToClipboard } = await generateLabelCommand(buildCartonLabelPayload({
        customerName: carton.customer_name, orderRef: carton.order_ref,
        cartonIndex: carton.carton_index, itemCount: contents.length,
        netWeightKg: net, barcode: barcodeDisplay?.labelBarcode || carton.carton_no,
      }));
      await recordLabelGenerated({ refType: "carton", refId: carton.id, copiedToClipboard });
      toast.success("Carton packed — label command generated", { description: NO_PHYSICAL_PRINT_NOTE });
      setCarton(null); setContents([]); setIdentityResult(null);
      setRecentCartons(await listTable<Carton>("ols_cartons", { order: "created_at", limit: 6 }));
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to finalize carton");
      setCartonError(msg);
      toast.error(msg, { duration: Infinity });
    }
  }


  const identitySyncStatus: CentralScanSyncStatus =
    submitResult?.status ?? identityResult?.centralSyncStatus ?? "preview_only";

  async function handleSubmitCentral() {
    if (!identityResult?.payload || !identityResult.idempotencyKey) return;
    try {
      setCartonError(null);
      setSubmitting(true);
      const r = await submitCentralScan({
        idempotencyKey: identityResult.idempotencyKey,
        payload: identityResult.payload as unknown as Record<string, unknown>,
        scanHistoryId: identityResult.scanHistoryId,
        session,
      });
      setSubmitResult(r);
      if (r.ok) toast.success(r.message);
      else if (r.duplicate) toast.warning(r.message);
      else toast.error(r.message);
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to submit carton identity to Central");
      setCartonError(msg);
      toast.error(msg, { duration: Infinity });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryCentral() {
    if (!identityResult?.payload || !identityResult.idempotencyKey) return;
    try {
      setCartonError(null);
      setSubmitting(true);
      const r = await retryCentralScan({
        idempotencyKey: identityResult.idempotencyKey,
        payload: identityResult.payload as unknown as Record<string, unknown>,
        scanHistoryId: identityResult.scanHistoryId,
        session,
      });
      setSubmitResult(r);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to retry carton identity submission");
      setCartonError(msg);
      toast.error(msg, { duration: Infinity });
    } finally {
      setSubmitting(false);
    }
  }

  const fastScan = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  return (
    <div className={fastScan ? "ols-fast-scan" : undefined}>
      <PageHeader
        eyebrow="Dispatch"
        title="Cartonization & Packing"
        description="Verify CTN-SO carton identity, then scan production labels into the carton."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="ols-card p-5 lg:col-span-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Order</Label>
              <Select value={orderRef} onValueChange={setOrderRef} disabled={!!carton}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.order_number}>{o.order_number} — {o.customer_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!carton ? (
              <Button onClick={startCarton} className="bg-gradient-primary text-primary-foreground"><PackagePlus size={16} className="mr-1.5" /> Start Carton</Button>
            ) : (
              <Button variant="outline" onClick={finalizeCarton}><Printer size={16} className="mr-1.5" /> Pack & Generate Carton Label</Button>
            )}
          </div>

          {cartonError && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <strong>Carton error:</strong> {cartonError}
            </div>
          )}

          {carton && (
            <div className="mt-5 rounded-2xl border bg-gradient-surface p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="ols-section-title">Active carton</p>
                  <p className="font-mono text-lg font-semibold">{carton.carton_no}</p>
                  <p className="text-xs text-muted-foreground">{carton.order_ref} · {carton.customer_name}</p>
                  {barcodeDisplay?.centralBarcode && (
                    <p className="mt-1 font-mono text-xs text-primary">
                      Central barcode: {barcodeDisplay.centralBarcode}
                    </p>
                  )}
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Legacy/local barcode: {barcodeDisplay?.legacyBarcode || carton.carton_no}
                  </p>
                </div>
                <StatusPill status="draft" />
              </div>

              {supportsCentralBarcode(carton.order_ref) && (
                <div className="mt-4 rounded-lg border border-dashed p-3">
                  <p className="ols-section-title mb-2">Carton identity (CTN-SO)</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Scan CTN-SO order barcode…"
                      aria-label="Carton identity barcode input"
                      value={identityScan}
                      onChange={e => setIdentityScan(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && verifyCartonIdentity()}
                      className="font-mono"
                    />
                    <Button onClick={verifyCartonIdentity} variant="secondary"><ScanBarcode size={16} /></Button>
                  </div>
                  <CentralPayloadPreview
                    title="Central carton identity payload"
                    payload={identityResult?.payload ?? null}
                    idempotencyKey={identityResult?.idempotencyKey}
                    readyForCentral={!!identityResult?.readyForCentral}
                    userMessage={identityResult?.userMessage}
                    syncStatus={identitySyncStatus}
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
              )}

              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Scan or type production label number…"
                  aria-label="Production label barcode input"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && scanLabel()}
                  className="font-mono"
                  autoFocus={!supportsCentralBarcode(carton.order_ref)}
                />
                <Button onClick={scanLabel}><ScanBarcode size={16} /></Button>
              </div>

              <div className="mt-4">
                <p className="ols-section-title mb-2">Contents · {contents.length}</p>
                {contents.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">Scan a production label to add it.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {contents.map((c, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <p className="font-mono text-xs">{c.label?.label_no}</p>
                          <p className="text-xs text-muted-foreground">{c.label?.metadata?.product_name} · {c.label?.tray_serial}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{c.label?.net_weight} kg</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ols-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Carton label preview · 100 × 75 mm</h3>
          <div className="flex justify-center py-3">
            <LabelPreview
              widthMm={100} heightMm={75}
              eyebrow="Carton · 100 × 75 mm"
              title={carton?.customer_name || "Customer"}
              lines={[
                `Order ${carton?.order_ref || "—"}`,
                `Carton ${carton?.carton_index ?? "—"} · Items ${contents.length}`,
                `Net ${contents.reduce((s, c) => s + (c.label?.net_weight || 0), 0).toFixed(2)} kg`,
                barcodeDisplay?.centralBarcode
                  ? `Central ${barcodeDisplay.centralBarcode}`
                  : `Legacy ${barcodeDisplay?.legacyBarcode || "—"}`,
              ]}
              barcode={barcodeDisplay?.labelBarcode || "CTN-PREVIEW-0001"}
            />
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground/80">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Central orders require CTN-SO identity verification before pack. Legacy orders use local CTN-YYYYMMDD IDs only.
          </div>
        </div>
      </div>

      <section className="mt-8 ols-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Recent cartons</h3>
        {recentCartons.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No cartons yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Carton</th><th className="px-3 py-2">Central</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {recentCartons.map(c => {
                  const d = resolveCartonBarcodeDisplay(c.order_ref || "", c.carton_no, c.metadata);
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{c.carton_no}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">{d.centralBarcode || "—"}</td>
                      <td className="px-3 py-2">{c.order_ref}</td>
                      <td className="px-3 py-2">{c.customer_name}</td>
                      <td className="px-3 py-2">{c.net_weight?.toFixed?.(2) || "—"} kg</td>
                      <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
