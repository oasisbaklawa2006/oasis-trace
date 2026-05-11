import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";
import { FileText, Receipt, Truck, Tag, ShieldCheck, Printer } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { PrintSheet } from "@/components/PrintSheet";
import { Barcode } from "@/components/Barcode";
import { LabelPreview } from "@/components/LabelPreview";

export default function DispatchBundle() {
  const [dpls, setDpls] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [shipping, setShipping] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);

  useEffect(() => { (async () => {
    const [d, p, s, c] = await Promise.all([
      listTable("ols_dpl_documents", { order: "created_at" }),
      listTable("ols_finance_pi"),
      listTable("ols_shipping_labels"),
      listTable("ols_cartons"),
    ]);
    setDpls(d); setPis(p); setShipping(s); setCartons(c);
  })(); }, []);

  const bundle = useMemo(() => {
    if (!active) return null;
    const pi = pis.find(p => p.order_ref === active.order_ref);
    const ctns = cartons.filter(c => c.order_ref === active.order_ref);
    const ships = shipping.filter(s => pi && s.pi_id === pi.id);
    return { dpl: active, pi, cartons: ctns, ships };
  }, [active, pis, cartons, shipping]);

  return (
    <div>
      <PageHeader
        eyebrow="Dispatch"
        title="Dispatch Document Bundle"
        description="DPL + simplified packing list + PI + invoice ref + LR/AWB + gate pass + shipping labels."
        actions={bundle ? <Button onClick={() => window.print()} className="bg-gradient-primary text-primary-foreground"><Printer size={14} className="mr-1.5" /> Print full bundle</Button> : null}
      />

      {dpls.length === 0 ? (
        <EmptyState title="No bundles yet" description="Generate a DPL first, then clear PI." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 no-print">
          {dpls.map(d => {
            const pi = pis.find(p => p.order_ref === d.order_ref);
            const ship = shipping.filter(s => pi && s.pi_id === pi.id);
            return (
              <button key={d.id} onClick={() => setActive(d)} className={`ols-card p-5 text-left transition-shadow hover:shadow-elevated ${active?.id === d.id ? "ring-2 ring-primary" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="ols-section-title">Bundle</p>
                    <p className="font-mono text-base font-semibold">{d.dpl_no}</p>
                    <p className="text-xs text-muted-foreground">{d.order_ref} · {d.customer_name}</p>
                  </div>
                  <StatusPill status={pi?.status === "cleared" ? "cleared" : "pending"} />
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  <Row icon={FileText} label="DPL" value={d.dpl_no} />
                  <Row icon={Receipt} label="Proforma Invoice" value={pi?.pi_no || "—"} />
                  <Row icon={Receipt} label="Final Invoice" value={pi?.invoice_ref || "—"} />
                  <Row icon={Truck} label="Transport LR/AWB" value={pi?.tally_invoice_no ? `Tally ${pi.tally_invoice_no}` : "—"} />
                  <Row icon={Tag} label="Shipping labels" value={`${ship.length} generated`} />
                  <Row icon={ShieldCheck} label="Gate pass" value={ship.length ? "Ready" : "—"} />
                </ul>
              </button>
            );
          })}
        </div>
      )}

      {bundle && (
        <div className="mt-6 space-y-4">
          {/* Cover */}
          <PrintSheet pageBreakAfter>
            <div className="text-center">
              <p className="text-[10px] font-semibold tracking-[0.3em] text-muted-foreground">OASIS BAKLAWA</p>
              <h1 className="mt-2 text-3xl font-semibold">Dispatch Bundle</h1>
              <p className="mt-1 text-sm text-muted-foreground">{bundle.dpl.order_ref} · {bundle.dpl.customer_name}</p>
              <p className="mt-8 font-mono text-lg">{bundle.dpl.dpl_no}</p>
              <p className="text-xs text-muted-foreground">Generated {new Date().toLocaleString()}</p>
            </div>
            <table className="mx-auto mt-12 max-w-md text-sm">
              <tbody>
                <BundleRow k="Customer" v={bundle.dpl.customer_name} />
                <BundleRow k="Destination" v={bundle.dpl.destination || "—"} />
                <BundleRow k="Transport" v={bundle.dpl.transport_mode || "—"} />
                <BundleRow k="Cartons" v={String(bundle.cartons.length)} />
                <BundleRow k="PI" v={bundle.pi?.pi_no || "—"} />
                <BundleRow k="Invoice" v={bundle.pi?.invoice_ref || "—"} />
                <BundleRow k="Shipping labels" v={String(bundle.ships.length)} />
              </tbody>
            </table>
          </PrintSheet>

          {/* Simplified Packing List */}
          <PrintSheet pageBreakAfter>
            <h2 className="text-lg font-semibold">Simplified Packing List</h2>
            <p className="text-xs text-muted-foreground">Order {bundle.dpl.order_ref}</p>
            <table className="mt-4 w-full text-xs">
              <thead className="bg-secondary text-left uppercase tracking-wider">
                <tr><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Carton</th><th className="px-2 py-1.5 text-right">Net kg</th><th className="px-2 py-1.5 text-right">Gross kg</th><th className="px-2 py-1.5">Status</th></tr>
              </thead>
              <tbody>
                {bundle.cartons.map((c, i) => (
                  <tr key={c.id} className="border-b">
                    <td className="px-2 py-1.5">{i + 1}</td>
                    <td className="px-2 py-1.5 font-mono">{c.carton_no}</td>
                    <td className="px-2 py-1.5 text-right">{(c.net_weight || 0).toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right">{(c.gross_weight || 0).toFixed(2)}</td>
                    <td className="px-2 py-1.5"><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PrintSheet>

          {/* PI summary */}
          <PrintSheet pageBreakAfter>
            <h2 className="text-lg font-semibold">PI / Invoice Summary</h2>
            {bundle.pi ? (
              <table className="mt-4 max-w-md text-sm">
                <tbody>
                  <BundleRow k="PI No" v={bundle.pi.pi_no} />
                  <BundleRow k="Invoice ref" v={bundle.pi.invoice_ref || "—"} />
                  <BundleRow k="Tally invoice" v={bundle.pi.tally_invoice_no || "—"} />
                  <BundleRow k="E-way bill" v={bundle.pi.eway_bill_no || "—"} />
                  <BundleRow k="Status" v={bundle.pi.status} />
                  <BundleRow k="Cleared at" v={bundle.pi.cleared_at ? new Date(bundle.pi.cleared_at).toLocaleString() : "—"} />
                </tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">No PI on file.</p>}
          </PrintSheet>

          {/* Gate Pass */}
          <PrintSheet pageBreakAfter>
            <h2 className="text-lg font-semibold">Gate Pass</h2>
            <p className="text-xs text-muted-foreground">Authorize the cartons below to leave the premises.</p>
            <div className="mt-4 grid gap-2">
              {bundle.ships.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-md border bg-surface px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono text-xs">{s.shipping_no}</p>
                    <p className="text-[11px] text-muted-foreground">QR {s.qr_ref}</p>
                  </div>
                  <Barcode value={s.qr_ref} availableWidthMm={50} height={36} displayValue={false} />
                </div>
              ))}
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 text-[11px] text-muted-foreground">
              <div>Security<br /><span className="mt-6 block border-t border-dashed pt-1">________________</span></div>
              <div>Driver<br /><span className="mt-6 block border-t border-dashed pt-1">________________</span></div>
              <div>Stamp<br /><span className="mt-10 block border-t border-dashed pt-1">________________</span></div>
            </div>
          </PrintSheet>

          {/* Shipping label thumbnails */}
          <PrintSheet>
            <h2 className="text-lg font-semibold">Shipping Labels</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {bundle.ships.map(s => (
                <div key={s.id} className="flex justify-center">
                  <LabelPreview
                    widthMm={100} heightMm={150}
                    eyebrow="Shipping · 100 × 150 mm"
                    title={s.consignee}
                    lines={[`Invoice ${s.invoice_ref || "—"}`, s.shipping_no]}
                    barcode={s.shipping_no}
                    qr={s.qr_ref}
                    scale={0.5}
                  />
                </div>
              ))}
            </div>
          </PrintSheet>
        </div>
      )}
    </div>
  );
}
function Row({ icon: I, label, value }: any) {
  return (
    <li className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs">
      <span className="flex items-center gap-2"><I size={13} className="text-muted-foreground" /> {label}</span>
      <span className="font-mono">{value}</span>
    </li>
  );
}
function BundleRow({ k, v }: { k: string; v: string }) {
  return <tr className="border-b"><td className="py-1.5 pr-6 text-muted-foreground">{k}</td><td className="py-1.5 font-mono">{v}</td></tr>;
}
