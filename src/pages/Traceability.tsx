import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listTable } from "@/lib/data";
import { Search, Factory, Boxes, PackageCheck, ClipboardList, Receipt, Tag, ShieldCheck, Truck, Copy, Download, Zap, History } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { buildIndex, search, recentSearches, pushRecent, KIND_LABEL, type SearchDoc } from "@/lib/traceSearch";
import { downloadCSV } from "@/lib/csvExport";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import type {
  Carton, CartonContent, DplDocument, FinancePi, GateScanRow,
  InventoryMovement, ProductionLabel, ShippingLabelRow,
} from "@/lib/types";
import { resolveTraceChain } from "@/lib/traceChain";

export default function Traceability() {
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<SearchDoc[]>([]);
  const [chosen, setChosen] = useState<SearchDoc | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [quickScan, setQuickScan] = useState(false);

  // Chain data (lazy-resolved once docs are loaded)
  const [labels, setLabels] = useState<ProductionLabel[]>([]);
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [contents, setContents] = useState<CartonContent[]>([]);
  const [pis, setPis] = useState<FinancePi[]>([]);
  const [shipping, setShipping] = useState<ShippingLabelRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [dpls, setDpls] = useState<DplDocument[]>([]);
  const [gateScans, setGateScans] = useState<GateScanRow[]>([]);

  useEffect(() => {
    setRecent(recentSearches());
    (async () => {
      const idx = await buildIndex();
      setDocs(idx);
      const [l, c, cc, p, s, m, d, g] = await Promise.all([
        listTable<ProductionLabel>("ols_production_labels"), listTable<Carton>("ols_cartons"), listTable<CartonContent>("ols_carton_contents"),
        listTable<FinancePi>("ols_finance_pi"), listTable<ShippingLabelRow>("ols_shipping_labels"), listTable<InventoryMovement>("ols_inventory_movements"),
        listTable<DplDocument>("ols_dpl_documents"), listTable<GateScanRow>("ols_gate_scans"),
      ]);
      setLabels(l); setCartons(c); setContents(cc); setPis(p); setShipping(s); setMovements(m); setDpls(d); setGateScans(g);
    })();
  }, []);

  const results = useMemo(() => search(docs, q), [q, docs]);
  const showResults = q.trim().length > 0 && !chosen;

  function pick(d: SearchDoc) {
    setChosen(d); pushRecent(d.ref); setRecent(recentSearches());
  }

  const chain = useMemo(() => {
    if (!chosen) return null;
    return resolveTraceChain(chosen, { labels, cartons, contents, pis, shipping, movements, dpls, gateScans });
  }, [chosen, labels, cartons, contents, pis, shipping, movements, dpls, gateScans]);

  function copyChain() {
    if (!chain) return;
    navigator.clipboard.writeText(JSON.stringify(chain, null, 2))
      .then(() => toast.success("Chain copied to clipboard"))
      .catch(() => toast.error("Clipboard unavailable"));
  }

  function exportCsv() {
    if (!chain) return;
    const rows = [{
      label: chain.label?.label_no, sku: chain.label?.metadata?.sku, batch: chain.label?.batch_no,
      carton: chain.carton?.carton_no, order: chain.carton?.order_ref, customer: chain.carton?.customer_name,
      dpl: chain.dpl?.dpl_no, pi: chain.pi?.pi_no, invoice: chain.pi?.invoice_ref,
      shipping: chain.ship?.shipping_no, qr: chain.ship?.qr_ref,
      gate: chain.gate?.result, gate_at: chain.gate?.scanned_at,
    }];
    downloadCSV({
      title: `Trace ${chosen?.ref || ""}`, generatedAt: new Date().toLocaleString(),
      columns: Object.keys(rows[0]).map(k => ({ key: k, header: k })),
      rows,
    });
  }

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Traceability Timeline" description="Search across labels, cartons, DPL, PI, shipping, gate scans, customers and orders. Fuzzy matching, quick scan and one-click export." />

      <div className="ols-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[220px] gap-2">
            <Input
              value={q}
              onChange={e => { setQ(e.target.value); setChosen(null); }}
              onKeyDown={e => { if (e.key === "Enter" && results[0]) pick(results[0]); }}
              placeholder="Type a barcode, SKU, batch, order, invoice, customer, QR…"
              aria-label="Traceability search"
              className={cn("font-mono", quickScan && "h-14 text-lg")}
              autoFocus
            />
            <Button onClick={() => results[0] && pick(results[0])}><Search size={16} /></Button>
          </div>
          <Button variant={quickScan ? "default" : "outline"} size="sm" onClick={() => setQuickScan(v => !v)}>
            <Zap size={14} className="mr-1" /> Quick scan
          </Button>
          {chain && (
            <>
              <Button variant="outline" size="sm" onClick={copyChain}><Copy size={14} className="mr-1" /> Copy</Button>
              <Button variant="outline" size="sm" onClick={exportCsv}><Download size={14} className="mr-1" /> CSV</Button>
            </>
          )}
        </div>

        {/* Recent searches */}
        {!q && recent.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <History size={12} className="text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent</span>
            {recent.map(r => (
              <button key={r} onClick={() => setQ(r)} className="rounded-full border bg-surface px-2.5 py-0.5 font-mono text-xs hover:bg-secondary">{r}</button>
            ))}
          </div>
        )}

        {/* Result list */}
        {showResults && (
          <div className="mt-4 space-y-1">
            {results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No matches across entities.</p>
            ) : results.map(r => (
              <button key={`${r.kind}-${r.id}`} onClick={() => pick(r)} className="flex w-full items-center justify-between rounded-xl border bg-surface px-3 py-2 text-left text-sm hover:bg-secondary">
                <div className="min-w-0">
                  <p className="truncate">{r.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{r.ref}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{KIND_LABEL[r.kind]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div className="mt-6">
          {!chosen && !showResults && <p className="py-10 text-center text-sm text-muted-foreground">Type a value to trace, or pick from recent searches.</p>}
          {chain && (
            <div className="relative pl-6">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              <Node icon={Factory} title="Production Label" status={chain.label?.status} ts={chain.label?.created_at} resolved={!!chain.label}>
                {chain.label && <Grid items={{
                  Ref: chain.label.label_no, Product: chain.label.metadata?.product_name, SKU: chain.label.metadata?.sku,
                  Tray: chain.label.tray_serial, Net: `${chain.label.net_weight} kg`,
                  MFG: chain.label.mfg_date, Best: chain.label.best_before, QC: chain.label.qc_status,
                }} />}
              </Node>
              <Node icon={Boxes} title="Stock & Movements" resolved={(chain.labelMovements?.length || 0) > 0}>
                {(chain.labelMovements?.length || 0) === 0 ? <p className="text-xs text-muted-foreground">No movements logged.</p> :
                  <ul className="space-y-1 text-xs">
                    {chain.labelMovements!.map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <span className="font-mono">{m.movement_type}</span>
                        <span className="text-muted-foreground">{m.from_location} → {m.to_location}</span>
                        <span className="ml-auto text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>}
              </Node>
              <Node icon={PackageCheck} title="Carton" status={chain.carton?.status} ts={chain.carton?.packed_at} resolved={!!chain.carton}>
                {chain.carton ? <Grid items={{
                  Ref: chain.carton.carton_no, Order: chain.carton.order_ref, Customer: chain.carton.customer_name,
                  Net: `${chain.carton.net_weight?.toFixed?.(2) || "—"} kg`, Gross: `${chain.carton.gross_weight?.toFixed?.(2) || "—"} kg`,
                }} /> : <p className="text-xs text-muted-foreground">Not yet packed.</p>}
              </Node>
              <Node icon={ClipboardList} title="DPL" status={chain.dpl?.status} ts={chain.dpl?.created_at} resolved={!!chain.dpl}>
                {chain.dpl ? <Grid items={{ Ref: chain.dpl.dpl_no, Cartons: String(chain.dpl.total_cartons), Net: `${(chain.dpl.total_net || 0).toFixed(2)} kg`, Destination: chain.dpl.destination || "—" }} /> : <p className="text-xs text-muted-foreground">No DPL yet.</p>}
              </Node>
              <Node icon={Receipt} title="Finance PI" status={chain.pi?.status} ts={chain.pi?.cleared_at} resolved={!!chain.pi}>
                {chain.pi ? <Grid items={{ PI: chain.pi.pi_no, Invoice: chain.pi.invoice_ref || "—", Tally: chain.pi.tally_invoice_no || "—", Eway: chain.pi.eway_bill_no || "—" }} /> : <p className="text-xs text-muted-foreground">No PI yet.</p>}
              </Node>
              <Node icon={Tag} title="Shipping Label" status={chain.ship?.status} ts={chain.ship?.created_at} resolved={!!chain.ship}>
                {chain.ship ? <Grid items={{ Ref: chain.ship.shipping_no, QR: chain.ship.qr_ref, Consignee: chain.ship.consignee, Route: chain.ship.route || "—" }} /> : <p className="text-xs text-muted-foreground">No shipping label yet.</p>}
              </Node>
              <Node icon={ShieldCheck} title="Gate Scan" status={chain.gate?.result} ts={chain.gate?.scanned_at} resolved={!!chain.gate}>
                {chain.gate ? <Grid items={{ Result: chain.gate.result?.toUpperCase(), Reason: chain.gate.reason || "—", When: new Date(chain.gate.scanned_at || chain.gate.created_at).toLocaleString() }} /> : <p className="text-xs text-muted-foreground">Not yet scanned at gate.</p>}
              </Node>
              <Node icon={Truck} title="Dispatched" resolved={chain.carton?.status === "dispatched" || chain.ship?.status === "dispatched"}>
                <p className="text-xs text-muted-foreground">{(chain.carton?.status === "dispatched" || chain.ship?.status === "dispatched") ? "Cleared and released from premises." : "Awaiting dispatch."}</p>
              </Node>
            </div>
          )}
          {chosen && !chain && <EmptyState title="No chain resolved" description="Could not link this entity to upstream/downstream records." />}
        </div>
      </div>
    </div>
  );
}

interface NodeProps {
  icon: LucideIcon;
  title: string;
  status?: string;
  ts?: string;
  resolved: boolean;
  children?: ReactNode;
}
function Node({ icon: Icon, title, status, ts, resolved, children }: NodeProps) {
  return (
    <div className="relative mb-4 pl-8">
      <div className={cn("absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2", resolved ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}>
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
function Grid({ items }: { items: Record<string, string | number | null | undefined> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
      {Object.entries(items).map(([k, v]) => (<div key={k}><span className="text-muted-foreground">{k}</span><p className="font-medium">{v ?? "—"}</p></div>))}
    </div>
  );
}
