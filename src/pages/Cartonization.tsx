import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listTable, insertRow, updateRow } from "@/lib/data";
import { num } from "@/lib/numbering";
import { Barcode } from "@/components/Barcode";
import { ScanBarcode, PackagePlus, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/StatusPill";

export default function Cartonization() {
  const [orders, setOrders] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const [orderRef, setOrderRef] = useState("");
  const [carton, setCarton] = useState<any | null>(null);
  const [contents, setContents] = useState<any[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [recentCartons, setRecentCartons] = useState<any[]>([]);

  useEffect(() => { (async () => {
    setOrders(await listTable("ols_orders_cache"));
    const lbls = await listTable<any>("ols_production_labels");
    setLabels(lbls);
    const cc = await listTable<any>("ols_carton_contents");
    setPacked(new Set(cc.filter(c => c.production_label_id).map(c => c.production_label_id)));
    setRecentCartons(await listTable("ols_cartons", { order: "created_at", limit: 6 }));
  })(); }, []);

  async function startCarton() {
    if (!orderRef) { toast.error("Pick an order first"); return; }
    const order = orders.find(o => o.order_number === orderRef);
    const c = await insertRow<any>("ols_cartons", {
      carton_no: num.carton(),
      order_ref: orderRef,
      customer_code: order?.customer_code,
      customer_name: order?.customer_name,
      status: "draft",
      carton_index: (recentCartons.filter(r => r.order_ref === orderRef).length) + 1,
    });
    setCarton(c);
    setContents([]);
    toast.success(`Carton ${c.carton_no} created`);
  }

  async function scanLabel() {
    const code = scanInput.trim();
    if (!code || !carton) return;
    const lbl = labels.find(l => l.label_no === code);
    if (!lbl) { toast.error("Label not found", { description: "Use manual add if needed." }); return; }
    if (packed.has(lbl.id)) { toast.error("Duplicate scan blocked", { description: "Label already in another active carton." }); return; }
    const row = await insertRow<any>("ols_carton_contents", { carton_id: carton.id, production_label_id: lbl.id });
    await insertRow("ols_inventory_movements", {
      production_label_id: lbl.id, from_location: "store", to_location: "packing",
      movement_type: "carton_pack", reference_no: carton.carton_no,
    });
    setContents(c => [...c, { ...row, label: lbl }]);
    setPacked(p => new Set(p).add(lbl.id));
    setScanInput("");
  }

  async function finalizeCarton() {
    if (!carton || contents.length === 0) { toast.error("Add at least one label"); return; }
    const net = contents.reduce((s, c) => s + (c.label?.net_weight || 0), 0);
    const gross = contents.reduce((s, c) => s + (c.label?.gross_weight || 0), 0);
    const updated = await updateRow("ols_cartons", carton.id, {
      status: "packed", packed_at: new Date().toISOString(),
      net_weight: net, gross_weight: gross,
    });
    await insertRow("ols_print_logs", { ref_type: "carton", ref_id: carton.id, success: true });
    toast.success("Carton packed & label printed");
    setCarton(null); setContents([]);
    setRecentCartons(await listTable("ols_cartons", { order: "created_at", limit: 6 }));
  }

  return (
    <div>
      <PageHeader
        eyebrow="Dispatch"
        title="Cartonization & Packing"
        description="Scan production labels into a carton. Each label can only live in one active carton."
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
              <Button variant="outline" onClick={finalizeCarton}><Printer size={16} className="mr-1.5" /> Pack & Print Carton Label</Button>
            )}
          </div>

          {carton && (
            <div className="mt-5 rounded-2xl border bg-gradient-surface p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="ols-section-title">Active carton</p>
                  <p className="font-mono text-lg font-semibold">{carton.carton_no}</p>
                  <p className="text-xs text-muted-foreground">{carton.order_ref} · {carton.customer_name}</p>
                </div>
                <StatusPill status="draft" />
              </div>

              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Scan or type production label number…"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && scanLabel()}
                  className="font-mono"
                  autoFocus
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
          <h3 className="mb-3 text-sm font-semibold">Carton label preview</h3>
          <div className="rounded-xl border bg-surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">100 × 75 mm Carton</p>
            <p className="mt-1 text-base font-semibold">{carton?.customer_name || "Customer"}</p>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <div>Order <span className="font-mono text-foreground">{carton?.order_ref || "—"}</span></div>
              <div>Carton {carton?.carton_index ?? "—"} of —</div>
              <div>Items {contents.length}</div>
              <div>Net {contents.reduce((s, c) => s + (c.label?.net_weight || 0), 0).toFixed(2)} kg</div>
            </div>
            <div className="mt-3 flex justify-center"><Barcode value={carton?.carton_no || "CTN-PREVIEW-0001"} height={50} /></div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground/80">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Duplicate scans are blocked. Manual override requires a reason and is audit-logged.
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
                <tr><th className="px-3 py-2">Carton</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {recentCartons.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{c.carton_no}</td>
                    <td className="px-3 py-2">{c.order_ref}</td>
                    <td className="px-3 py-2">{c.customer_name}</td>
                    <td className="px-3 py-2">{c.net_weight?.toFixed?.(2) || "—"} kg</td>
                    <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
