import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listTable } from "@/lib/data";
import { Search, Factory, Boxes, PackageCheck, ClipboardList, Receipt, Tag, ShieldCheck, Truck } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export default function Traceability() {
  const [q, setQ] = useState("");
  const [labels, setLabels] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [shipping, setShipping] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [dpls, setDpls] = useState<any[]>([]);
  const [gateScans, setGateScans] = useState<any[]>([]);

  useEffect(() => { (async () => {
    const [l, c, cc, p, s, m, d, g] = await Promise.all([
      listTable("ols_production_labels"),
      listTable("ols_cartons"),
      listTable("ols_carton_contents"),
      listTable("ols_finance_pi"),
      listTable("ols_shipping_labels"),
      listTable("ols_inventory_movements"),
      listTable("ols_dpl_documents"),
      listTable("ols_gate_scans"),
    ]);
    setLabels(l); setCartons(c); setContents(cc); setPis(p); setShipping(s); setMovements(m); setDpls(d); setGateScans(g);
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
    const dpl = carton ? dpls.find(d => d.order_ref === carton.order_ref) : undefined;
    const gate = ship ? gateScans.find(g => g.shipping_label_id === ship.id) : undefined;
    return { label, carton, pi, ship, labelMovements, dpl, gate };
  }, [q, labels, cartons, contents, pis, shipping, movements, dpls, gateScans]);

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Traceability Timeline" description="Search by production label, carton, shipping QR, SKU, batch, order, customer, DPL, invoice." />

      <div className="ols-card p-5">
        <div className="flex gap-2">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Type a barcode, SKU, order, invoice…" className="font-mono" autoFocus />
          <Button><Search size={16} /></Button>
        </div>

        <div className="mt-6">
          {!found && <p className="py-10 text-center text-sm text-muted-foreground">Enter a value above to trace.</p>}
          {found?.empty && <EmptyState title="No match" description="Nothing found across labels, cartons, PIs, or shipping." />}
          {found && !found.empty && (
            <div className="relative pl-6">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              <Node icon={Factory} title="Production Label" status={found.label?.status} ts={found.label?.created_at} resolved={!!found.label}>
                {found.label && <Grid items={{
                  Ref: found.label.label_no, Product: found.label.metadata?.product_name, SKU: found.label.metadata?.sku,
                  Tray: found.label.tray_serial, Net: `${found.label.net_weight} kg`,
                  MFG: found.label.mfg_date, Best: found.label.best_before,
                  QC: found.label.qc_status, Dept: found.label.metadata?.department,
                }} />}
              </Node>

              <Node icon={Boxes} title="Stock & Movements" resolved={(found.labelMovements?.length || 0) > 0}>
                {(found.labelMovements?.length || 0) === 0 ? <p className="text-xs text-muted-foreground">No movements logged.</p> :
                  <ul className="space-y-1 text-xs">
                    {found.labelMovements!.map((m: any) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <span className="font-mono">{m.movement_type}</span>
                        <span className="text-muted-foreground">{m.from_location} → {m.to_location}</span>
                        <span className="ml-auto text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>}
              </Node>

              <Node icon={PackageCheck} title="Carton" status={found.carton?.status} ts={found.carton?.packed_at} resolved={!!found.carton}>
                {found.carton ? <Grid items={{
                  Ref: found.carton.carton_no, Order: found.carton.order_ref, Customer: found.carton.customer_name,
                  Net: `${found.carton.net_weight?.toFixed?.(2) || "—"} kg`,
                  Gross: `${found.carton.gross_weight?.toFixed?.(2) || "—"} kg`,
                }} /> : <p className="text-xs text-muted-foreground">Not yet packed.</p>}
              </Node>

              <Node icon={ClipboardList} title="DPL" status={found.dpl?.status} ts={found.dpl?.created_at} resolved={!!found.dpl}>
                {found.dpl ? <Grid items={{
                  Ref: found.dpl.dpl_no, Cartons: String(found.dpl.total_cartons),
                  Net: `${(found.dpl.total_net || 0).toFixed(2)} kg`, Destination: found.dpl.destination || "—",
                }} /> : <p className="text-xs text-muted-foreground">No DPL yet.</p>}
              </Node>

              <Node icon={Receipt} title="Finance PI" status={found.pi?.status} ts={found.pi?.cleared_at} resolved={!!found.pi}>
                {found.pi ? <Grid items={{
                  PI: found.pi.pi_no, Invoice: found.pi.invoice_ref || "—",
                  Tally: found.pi.tally_invoice_no || "—", Eway: found.pi.eway_bill_no || "—",
                }} /> : <p className="text-xs text-muted-foreground">No PI yet.</p>}
              </Node>

              <Node icon={Tag} title="Shipping Label" status={found.ship?.status} ts={found.ship?.created_at} resolved={!!found.ship}>
                {found.ship ? <Grid items={{
                  Ref: found.ship.shipping_no, QR: found.ship.qr_ref,
                  Consignee: found.ship.consignee, Route: found.ship.route || "—",
                }} /> : <p className="text-xs text-muted-foreground">No shipping label yet.</p>}
              </Node>

              <Node icon={ShieldCheck} title="Gate Scan" status={found.gate?.result} ts={found.gate?.scanned_at} resolved={!!found.gate}>
                {found.gate ? <Grid items={{
                  Result: found.gate.result?.toUpperCase(), Reason: found.gate.reason || "—",
                  When: new Date(found.gate.scanned_at || found.gate.created_at).toLocaleString(),
                }} /> : <p className="text-xs text-muted-foreground">Not yet scanned at gate.</p>}
              </Node>

              <Node icon={Truck} title="Dispatched" resolved={found.carton?.status === "dispatched" || found.ship?.status === "dispatched"}>
                <p className="text-xs text-muted-foreground">
                  {(found.carton?.status === "dispatched" || found.ship?.status === "dispatched")
                    ? "Cleared and released from premises."
                    : "Awaiting dispatch."}
                </p>
              </Node>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Node({ icon: Icon, title, status, ts, resolved, children }: any) {
  return (
    <div className="relative mb-4 pl-8">
      <div className={cn(
        "absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2",
        resolved ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"
      )}>
        <Icon size={12} />
      </div>
      <div className={cn("ols-card p-4", !resolved && "opacity-60")}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <div className="flex items-center gap-2">
            {ts && <span className="text-[10px] text-muted-foreground">{new Date(ts).toLocaleString()}</span>}
            {status && <StatusPill status={status} />}
          </div>
        </div>
        {children}
      </div>
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
