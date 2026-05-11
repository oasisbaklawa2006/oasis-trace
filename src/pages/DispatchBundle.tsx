import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";
import { FileText, Receipt, Truck, Tag, ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";

export default function DispatchBundle() {
  const [dpls, setDpls] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [shipping, setShipping] = useState<any[]>([]);

  useEffect(() => { (async () => {
    setDpls(await listTable("ols_dpl_documents", { order: "created_at" }));
    setPis(await listTable("ols_finance_pi"));
    setShipping(await listTable("ols_shipping_labels"));
  })(); }, []);

  return (
    <div>
      <PageHeader eyebrow="Dispatch" title="Dispatch Document Bundle" description="DPL + simplified packing list + PI + invoice ref + e-way + LR/AWB + gate pass + shipping labels." />
      {dpls.length === 0 ? <EmptyState title="No bundles yet" description="Generate a DPL first, then clear PI." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {dpls.map(d => {
            const pi = pis.find(p => p.order_ref === d.order_ref);
            const ship = shipping.filter(s => pi && s.pi_id === pi.id);
            return (
              <div key={d.id} className="ols-card p-5">
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
              </div>
            );
          })}
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
