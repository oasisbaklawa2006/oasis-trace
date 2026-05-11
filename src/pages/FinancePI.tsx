import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listTable, insertRow, updateRow } from "@/lib/data";
import { num } from "@/lib/numbering";
import { ScanBarcode, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/StatusPill";

export default function FinancePI() {
  const [cartons, setCartons] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [piCartons, setPiCartons] = useState<any[]>([]);
  const [scan, setScan] = useState("");
  const [active, setActive] = useState<any | null>(null);
  const [invoiceRef, setInvoiceRef] = useState("");

  useEffect(() => { reload(); }, []);
  async function reload() {
    setCartons(await listTable("ols_cartons"));
    setContents(await listTable("ols_carton_contents"));
    setLabels(await listTable("ols_production_labels"));
    setPis(await listTable("ols_finance_pi", { order: "created_at" }));
    setPiCartons(await listTable("ols_finance_pi_cartons"));
  }

  async function scanCarton() {
    const code = scan.trim();
    if (!code) return;
    const c = cartons.find(x => x.carton_no === code);
    if (!c) { toast.error("Carton not found"); return; }
    let pi = active;
    if (!pi) {
      pi = await insertRow<any>("ols_finance_pi", {
        pi_no: num.pi(),
        order_ref: c.order_ref,
        customer_name: c.customer_name,
        status: "pending",
      });
      setActive(pi);
    }
    const dup = piCartons.find(p => p.pi_id === pi.id && p.carton_id === c.id);
    if (dup) { toast.error("Carton already on this PI"); setScan(""); return; }
    await insertRow("ols_finance_pi_cartons", { pi_id: pi.id, carton_id: c.id });
    await updateRow("ols_cartons", c.id, { status: "finance_received" });
    setScan("");
    await reload();
    toast.success(`Carton ${c.carton_no} added to PI ${pi.pi_no}`);
  }

  async function clearPI() {
    if (!active) return;
    if (!invoiceRef) { toast.error("Enter invoice reference"); return; }
    await updateRow("ols_finance_pi", active.id, { status: "cleared", cleared_at: new Date().toISOString(), invoice_ref: invoiceRef });
    const linked = piCartons.filter(p => p.pi_id === active.id).map(p => p.carton_id);
    for (const cid of linked) await updateRow("ols_cartons", cid, { status: "invoiced" });

    // Build SKU-wise simplified lines for customer view and persist them.
    const linkedCtns = cartons.filter(c => linked.includes(c.id));
    const bySku: Record<string, { name: string; qty: number; net: number; gross: number }> = {};
    for (const c of linkedCtns) {
      const items = contents.filter(x => x.carton_id === c.id);
      for (const it of items) {
        const lbl = labels.find(l => l.id === it.production_label_id);
        const sku = lbl?.metadata?.sku || it.manual_sku || "—";
        const name = lbl?.metadata?.product_name || "—";
        bySku[sku] ||= { name, qty: 0, net: 0, gross: 0 };
        bySku[sku].qty += 1;
        bySku[sku].net += lbl?.net_weight || 0;
        bySku[sku].gross += lbl?.gross_weight || 0;
      }
    }
    for (const [sku, v] of Object.entries(bySku)) {
      await insertRow("ols_finance_pi_lines", { pi_id: active.id, sku, product_name: v.name, quantity: v.qty, net_weight: v.net, gross_weight: v.gross });
    }
    toast.success("PI cleared — shipping labels can now be generated");
    setActive(null); setInvoiceRef("");
    await reload();
  }

  const linkedCartons = active ? cartons.filter(c => piCartons.some(pc => pc.pi_id === active.id && pc.carton_id === c.id)) : [];

  // SKU-wise summary for customer-facing
  const customerSku: Record<string, { name: string; qty: number; net: number }> = {};
  for (const c of linkedCartons) {
    const items = contents.filter(x => x.carton_id === c.id);
    for (const it of items) {
      const lbl = labels.find(l => l.id === it.production_label_id);
      const sku = lbl?.metadata?.sku || it.manual_sku || "—";
      const name = lbl?.metadata?.product_name || "—";
      customerSku[sku] ||= { name, qty: 0, net: 0 };
      customerSku[sku].qty += 1;
      customerSku[sku].net += lbl?.net_weight || 0;
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Finance PI Bridge"
        description="Scan carton barcodes to assemble a Proforma Invoice. Internal view stays carton-wise; customer view is automatically simplified SKU-wise."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="ols-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Scan carton</h3>
          <div className="flex gap-2">
            <Input
              value={scan} onChange={e => setScan(e.target.value)}
              onKeyDown={e => e.key === "Enter" && scanCarton()}
              placeholder="Scan carton barcode…" className="font-mono" autoFocus
            />
            <Button onClick={scanCarton}><ScanBarcode size={16} /></Button>
          </div>
          {active && (
            <div className="mt-4 rounded-xl border bg-surface p-3">
              <p className="ols-section-title">Active PI</p>
              <p className="font-mono text-base font-semibold">{active.pi_no}</p>
              <p className="text-xs text-muted-foreground">{active.order_ref} · {active.customer_name}</p>
              <p className="mt-2 text-xs">{linkedCartons.length} carton(s) attached</p>
              <div className="mt-3 space-y-2">
                <Label className="text-xs">Invoice reference</Label>
                <Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-2026-…" />
                <Button onClick={clearPI} className="w-full bg-gradient-gold text-accent-foreground shadow-gold">
                  <BadgeCheck size={16} className="mr-1.5" /> Mark Cleared
                </Button>
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="ols-section-title mb-2">Recent PIs</p>
            {pis.length === 0 ? <p className="text-xs text-muted-foreground">No PIs yet.</p> :
              <ul className="space-y-1.5">
                {pis.map(p => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg border bg-surface px-3 py-2 text-xs">
                    <span className="font-mono">{p.pi_no}</span>
                    <span className="text-muted-foreground">{p.customer_name}</span>
                    <StatusPill status={p.status} />
                  </li>
                ))}
              </ul>}
          </div>
        </div>

        <div className="ols-card p-5 lg:col-span-3">
          {!active ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Scan a carton to start a new PI.</p>
          ) : (
            <Tabs defaultValue="internal">
              <TabsList>
                <TabsTrigger value="internal">Internal · carton-wise</TabsTrigger>
                <TabsTrigger value="customer">Customer · SKU-wise</TabsTrigger>
              </TabsList>
              <TabsContent value="internal" className="mt-4">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-2 py-2">Carton</th><th className="px-2 py-2">Items</th><th className="px-2 py-2 text-right">Net</th><th className="px-2 py-2 text-right">Gross</th></tr>
                  </thead>
                  <tbody>
                    {linkedCartons.map(c => (
                      <tr key={c.id} className="border-t">
                        <td className="px-2 py-2 font-mono text-xs">{c.carton_no}</td>
                        <td className="px-2 py-2">{contents.filter(x => x.carton_id === c.id).length}</td>
                        <td className="px-2 py-2 text-right">{(c.net_weight || 0).toFixed(2)} kg</td>
                        <td className="px-2 py-2 text-right">{(c.gross_weight || 0).toFixed(2)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabsContent>
              <TabsContent value="customer" className="mt-4">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-2 py-2">SKU</th><th className="px-2 py-2">Product</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Net kg</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(customerSku).map(([sku, v]) => (
                      <tr key={sku} className="border-t">
                        <td className="px-2 py-2 font-mono text-xs">{sku}</td>
                        <td className="px-2 py-2">{v.name}</td>
                        <td className="px-2 py-2 text-right">{v.qty}</td>
                        <td className="px-2 py-2 text-right">{v.net.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-muted-foreground">Difference engine placeholder — will compare against original order quantities once order data is connected.</p>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
