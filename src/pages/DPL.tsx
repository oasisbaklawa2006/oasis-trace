import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { listTable, insertRow } from "@/lib/data";
import { num } from "@/lib/numbering";
import { Printer, FileText } from "lucide-react";
import { toast } from "sonner";
import { Barcode } from "@/components/Barcode";
import { PrintSheet } from "@/components/PrintSheet";
import { StatusPill } from "@/components/StatusPill";
import type { Carton, CartonContent, DplCarton, DplDocument, OrderCache, ProductionLabel } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { rollupBySku } from "@/lib/piRollup";
import { insertWithUniqueRetry } from "@/lib/insertWithRetry";
import { resolveDplMemberCartons } from "@/lib/dplMembership";

export default function DPL() {
  const [orders, setOrders] = useState<OrderCache[]>([]);
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [contents, setContents] = useState<CartonContent[]>([]);
  const [labels, setLabels] = useState<ProductionLabel[]>([]);
  const [orderRef, setOrderRef] = useState("");
  const [dpls, setDpls] = useState<DplDocument[]>([]);
  const [dplCartons, setDplCartons] = useState<DplCarton[]>([]);
  const [active, setActive] = useState<DplDocument | null>(null);
  const [activeCartons, setActiveCartons] = useState<Carton[]>([]);
  const [dplError, setDplError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { (async () => {
    setOrders(await listTable<OrderCache>("ols_orders_cache"));
    setCartons(await listTable<Carton>("ols_cartons"));
    setContents(await listTable<CartonContent>("ols_carton_contents"));
    setLabels(await listTable<ProductionLabel>("ols_production_labels"));
    setDpls(await listTable<DplDocument>("ols_dpl_documents", { order: "created_at" }));
    // Real FK source for DPL <-> carton membership — see dplMembership.ts.
    setDplCartons(await listTable<DplCarton>("ols_dpl_cartons"));
  })(); }, []);

  const cartonsForOrder = cartons.filter(c => c.order_ref === orderRef && c.status === "packed");

  async function generateDPL() {
    try {
      setDplError(null);
      if (!orderRef) { toast.error("Pick an order"); return; }
      if (cartonsForOrder.length === 0) { toast.error("No packed cartons for this order"); return; }
      setIsSubmitting(true);
      const order = orders.find(o => o.order_number === orderRef);
      const totals = cartonsForOrder.reduce((acc, c) => ({
        gross: acc.gross + (c.gross_weight || 0),
        net: acc.net + (c.net_weight || 0),
      }), { gross: 0, net: 0 });
      // dpl_no is randomly generated (numbering.ts) and can collide under
      // concurrent multi-terminal use — retry with a fresh id on a
      // confirmed unique-constraint violation, bounded.
      const dpl = await insertWithUniqueRetry<DplDocument>("ols_dpl_documents", () => ({
        dpl_no: num.dpl(),
        order_ref: orderRef,
        customer_name: order?.customer_name,
        destination: order?.destination,
        transport_mode: order?.transport_mode,
        total_cartons: cartonsForOrder.length,
        total_gross: totals.gross,
        total_net: totals.net,
        status: "open",
      }));
      const newLinks: DplCarton[] = [];
      for (let i = 0; i < cartonsForOrder.length; i++) {
        newLinks.push(await insertRow<DplCarton>("ols_dpl_cartons", { dpl_id: dpl.id, carton_id: cartonsForOrder[i].id, position: i + 1 }));
      }
      setDplCartons(prev => [...prev, ...newLinks]);
      setDpls(await listTable<DplDocument>("ols_dpl_documents", { order: "created_at" }));
      // All of cartonsForOrder were just linked to dpl.id above by
      // construction — use them directly rather than the just-updated
      // dplCartons state, which the next render hasn't committed yet.
      setActive(dpl);
      setActiveCartons(cartonsForOrder);
      toast.success(`DPL ${dpl.dpl_no} created with ${cartonsForOrder.length} cartons`);
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to generate DPL");
      setDplError(msg);
      toast.error(msg, { duration: Infinity });
    } finally {
      setIsSubmitting(false);
    }
  }

  function openDpl(d: DplDocument) {
    setActive(d);
    // FK-first: only cartons genuinely linked via ols_dpl_cartons, never
    // inferred from a shared order_ref (requirement 4).
    setActiveCartons(resolveDplMemberCartons(d.id, dplCartons, cartons));
  }

  function cartonSummary(cartonId: string) {
    return rollupBySku([cartonId], contents, labels);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Dispatch"
        title="DPL — Detailed Packing List"
        description="Carton-wise bridge between dispatch and finance."
        actions={<Button variant="outline" onClick={() => window.print()}><Printer size={16} className="mr-1.5" /> Print A4</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Generate DPL</h3>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Order</Label>
          <Select value={orderRef} onValueChange={setOrderRef}>
            <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
            <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.order_number}>{o.order_number} — {o.customer_name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">{cartonsForOrder.length} packed carton(s) ready</p>
          <Button onClick={generateDPL} disabled={isSubmitting} className="mt-3 w-full bg-gradient-primary text-primary-foreground"><FileText size={16} className="mr-1.5" /> Generate DPL</Button>
          {dplError && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <strong>DPL error:</strong> {dplError}
            </div>
          )}

          <div className="mt-6">
            <p className="ols-section-title mb-2">Recent DPLs</p>
            {dpls.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> :
              <ul className="space-y-1.5">
                {dpls.map(d => (
                  <li key={d.id}>
                    <button onClick={() => openDpl(d)} className="flex w-full items-center justify-between rounded-lg border bg-surface px-3 py-2 text-left text-xs hover:bg-secondary">
                      <span className="font-mono">{d.dpl_no}</span>
                      <span>{d.total_cartons} ctn</span>
                      <StatusPill status={d.status} />
                    </button>
                  </li>
                ))}
              </ul>}
          </div>
        </div>

        <div className="lg:col-span-2" id="dpl-print">
          {!active ? (
            <div className="ols-card p-12 text-center text-sm text-muted-foreground">Select or generate a DPL to view A4 print sheet.</div>
          ) : (
            <PrintSheet>
              <header className="flex items-start justify-between border-b pb-4">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">OASIS BAKLAWA</p>
                  <h2 className="text-xl font-semibold">Detailed Packing List</h2>
                  <p className="text-[11px] text-muted-foreground">Carton-wise dispatch & finance bridge</p>
                </div>
                <div className="text-right text-xs">
                  <p>DPL <span className="font-mono">{active.dpl_no}</span></p>
                  <p>Order <span className="font-mono">{active.order_ref}</span></p>
                  <p>Date {new Date(active.created_at).toLocaleDateString()}</p>
                </div>
              </header>
              <section className="grid grid-cols-2 gap-3 py-4 text-xs md:grid-cols-4">
                <div><span className="text-muted-foreground">Customer</span><p className="font-medium">{active.customer_name}</p></div>
                <div><span className="text-muted-foreground">Destination</span><p className="font-medium">{active.destination || "—"}</p></div>
                <div><span className="text-muted-foreground">Transport</span><p className="font-medium">{active.transport_mode || "—"}</p></div>
                <div><span className="text-muted-foreground">Prepared</span><p className="font-medium">{new Date(active.prepared_at || active.created_at).toLocaleString()}</p></div>
              </section>

              <section>
                <h3 className="ols-section-title mb-2">SKU Rollup</h3>
                <table className="w-full text-xs">
                  <thead className="bg-secondary text-left uppercase tracking-wider">
                    <tr><th className="px-2 py-1.5">SKU</th><th className="px-2 py-1.5">Product</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Net kg</th></tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const roll: Record<string, { name: string; qty: number; net: number }> = {};
                      for (const c of activeCartons) for (const s of cartonSummary(c.id)) {
                        roll[s.sku] ||= { name: s.name, qty: 0, net: 0 };
                        roll[s.sku].qty += s.qty; roll[s.sku].net += s.net;
                      }
                      return Object.entries(roll).map(([sku, v]) => (
                        <tr key={sku} className="border-b">
                          <td className="px-2 py-1.5 font-mono">{sku}</td>
                          <td className="px-2 py-1.5">{v.name}</td>
                          <td className="px-2 py-1.5 text-right">{v.qty}</td>
                          <td className="px-2 py-1.5 text-right">{v.net.toFixed(2)}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </section>

              <section className="mt-5">
                <h3 className="ols-section-title mb-2">Cartons</h3>
                <table className="w-full text-xs">
                  <thead className="bg-secondary text-left uppercase tracking-wider">
                    <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Carton barcode</th><th className="px-2 py-2">SKU summary</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Net kg</th><th className="px-2 py-2 text-right">Gross kg</th></tr>
                  </thead>
                  <tbody>
                    {activeCartons.map((c, i) => {
                      const sk = cartonSummary(c.id);
                      return (
                        <tr key={c.id} className="border-b align-top">
                          <td className="px-2 py-2">{i + 1}</td>
                          <td className="px-2 py-2">
                            <p className="font-mono">{c.carton_no}</p>
                            <div className="mt-1 max-w-[160px]"><Barcode value={c.carton_no} availableWidthMm={45} height={28} displayValue={false} /></div>
                          </td>
                          <td className="px-2 py-2">{sk.length === 0 ? "—" : sk.map(s => <div key={s.sku}>{s.name} <span className="text-muted-foreground">({s.sku})</span></div>)}</td>
                          <td className="px-2 py-2 text-right">{sk.reduce((s, x) => s + x.qty, 0)}</td>
                          <td className="px-2 py-2 text-right">{(c.net_weight || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{(c.gross_weight || 0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="px-2 py-2" colSpan={3}>Totals · {active.total_cartons} cartons</td>
                      <td className="px-2 py-2 text-right">—</td>
                      <td className="px-2 py-2 text-right">{(active.total_net || 0).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">{(active.total_gross || 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>

              <footer className="mt-8 grid grid-cols-3 gap-4 border-t pt-6 text-[11px] text-muted-foreground">
                <div>Prepared by<br /><span className="mt-6 block border-t border-dashed pt-1">________________</span></div>
                <div>Verified by<br /><span className="mt-6 block border-t border-dashed pt-1">________________</span></div>
                <div>Released by<br /><span className="mt-6 block border-t border-dashed pt-1">________________</span></div>
              </footer>
            </PrintSheet>
          )}
        </div>
      </div>
    </div>
  );
}
