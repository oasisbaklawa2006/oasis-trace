import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listTable } from "@/lib/data";
import { Search } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";

export default function Traceability() {
  const [q, setQ] = useState("");
  const [labels, setLabels] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [shipping, setShipping] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  useEffect(() => { (async () => {
    setLabels(await listTable("ols_production_labels"));
    setCartons(await listTable("ols_cartons"));
    setContents(await listTable("ols_carton_contents"));
    setPis(await listTable("ols_finance_pi"));
    setShipping(await listTable("ols_shipping_labels"));
    setMovements(await listTable("ols_inventory_movements"));
  })(); }, []);

  const found = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    const label = labels.find(l =>
      l.label_no?.toLowerCase() === term || l.metadata?.sku?.toLowerCase() === term ||
      l.metadata?.product_name?.toLowerCase().includes(term));
    let carton = cartons.find(c => c.carton_no?.toLowerCase() === term);
    let ship = shipping.find(s => s.shipping_no?.toLowerCase() === term || s.qr_ref?.toLowerCase() === term);
    let pi = pis.find(p => p.pi_no?.toLowerCase() === term || p.invoice_ref?.toLowerCase() === term);

    if (label && !carton) {
      const link = contents.find(c => c.production_label_id === label.id);
      if (link) carton = cartons.find(c => c.id === link.carton_id);
    }
    if (carton && !ship) ship = shipping.find(s => s.carton_id === carton.id);
    if (carton && !pi) pi = pis.find(p => p.order_ref === carton.order_ref);

    if (!label && !carton && !ship && !pi) return { empty: true };

    const labelMovements = label ? movements.filter(m => m.production_label_id === label.id) : [];
    return { label, carton, pi, ship, labelMovements };
  }, [q, labels, cartons, contents, pis, shipping, movements]);

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Traceability Search" description="Search by production label, carton, shipping QR, SKU, batch, order, customer, DPL, invoice." />

      <div className="ols-card p-5">
        <div className="flex gap-2">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Type a barcode, SKU, order, invoice…" className="font-mono" autoFocus />
          <Button><Search size={16} /></Button>
        </div>

        <div className="mt-5">
          {!found && <p className="py-10 text-center text-sm text-muted-foreground">Enter a value above to trace.</p>}
          {found?.empty && <EmptyState title="No match" description="Nothing found across labels, cartons, PIs, or shipping." />}
          {found && !found.empty && (
            <div className="space-y-4">
              <Step title="Origin · Production Label" badge={found.label?.label_no} status={found.label?.status}>
                {found.label ? (
                  <Grid items={{
                    Product: found.label.metadata?.product_name,
                    SKU: found.label.metadata?.sku,
                    Tray: found.label.tray_serial,
                    Net: `${found.label.net_weight} kg`,
                    "MFG": found.label.mfg_date,
                    "Best before": found.label.best_before,
                    "QC": found.label.qc_status,
                    Department: found.label.metadata?.department,
                  }} />
                ) : <p className="text-xs text-muted-foreground">No origin label resolved.</p>}
              </Step>

              <Step title="Movements" badge={`${found.labelMovements?.length || 0} events`}>
                {(!found.labelMovements || found.labelMovements.length === 0) ? <p className="text-xs text-muted-foreground">No movements logged.</p> :
                  <ul className="text-xs">
                    {found.labelMovements.map((m: any) => (
                      <li key={m.id} className="flex items-center gap-2 border-t py-1.5">
                        <span className="font-mono">{m.movement_type}</span>
                        <span className="text-muted-foreground">{m.from_location} → {m.to_location}</span>
                        <span className="ml-auto text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>}
              </Step>

              <Step title="Carton" badge={found.carton?.carton_no} status={found.carton?.status}>
                {found.carton ? <Grid items={{
                  Order: found.carton.order_ref, Customer: found.carton.customer_name,
                  Net: `${found.carton.net_weight?.toFixed?.(2) || "—"} kg`,
                  Gross: `${found.carton.gross_weight?.toFixed?.(2) || "—"} kg`,
                }} /> : <p className="text-xs text-muted-foreground">Not yet packed.</p>}
              </Step>

              <Step title="Finance PI" badge={found.pi?.pi_no} status={found.pi?.status}>
                {found.pi ? <Grid items={{
                  Invoice: found.pi.invoice_ref || "—",
                  Cleared: found.pi.cleared_at ? new Date(found.pi.cleared_at).toLocaleString() : "—",
                  EwayBill: found.pi.eway_bill_no || "—",
                  Tally: found.pi.tally_invoice_no || "—",
                }} /> : <p className="text-xs text-muted-foreground">No PI yet.</p>}
              </Step>

              <Step title="Shipping & Dispatch" badge={found.ship?.shipping_no} status={found.ship?.status}>
                {found.ship ? <Grid items={{
                  Consignee: found.ship.consignee, QRRef: found.ship.qr_ref,
                  Route: found.ship.route || "—",
                }} /> : <p className="text-xs text-muted-foreground">No shipping label yet.</p>}
              </Step>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ title, badge, status, children }: { title: string; badge?: string; status?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className="flex items-center gap-2">
          {badge && <span className="font-mono text-xs">{badge}</span>}
          {status && <StatusPill status={status} />}
        </div>
      </div>
      {children}
    </div>
  );
}
function Grid({ items }: { items: Record<string, any> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
      {Object.entries(items).map(([k, v]) => (
        <div key={k}><span className="text-muted-foreground">{k}</span><p className="font-medium">{v ?? "—"}</p></div>
      ))}
    </div>
  );
}
