import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { Factory, PackageCheck, Receipt, Tag, ShieldAlert, Printer, RotateCcw, Activity, ScanLine, Truck } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import type { LucideIcon } from "lucide-react";
import type {
  Carton, FinancePi, GateScanRow, PrinterRow, PrintLogRow,
  ProductionLabel, ScanHistoryRow, ShippingLabelRow,
} from "@/lib/types";
import type { ReprintRow } from "@/lib/reprintPolicy";

interface CardDef { label: string; value: number | string; hint?: string; tone?: "primary" | "gold" | "muted"; icon: LucideIcon; }

export default function Dashboard() {
  const [labels, setLabels] = useState<ProductionLabel[]>([]);
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [pis, setPis] = useState<FinancePi[]>([]);
  const [shipping, setShipping] = useState<ShippingLabelRow[]>([]);
  const [gates, setGates] = useState<GateScanRow[]>([]);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [scans, setScans] = useState<ScanHistoryRow[]>([]);
  const [printLogs, setPrintLogs] = useState<PrintLogRow[]>([]);
  const [reprints, setReprints] = useState<ReprintRow[]>([]);

  async function reload() {
    setLabels(await listTable<ProductionLabel>("ols_production_labels", { order: "created_at", limit: 200 }));
    setCartons(await listTable<Carton>("ols_cartons", { order: "created_at", limit: 200 }));
    setPis(await listTable<FinancePi>("ols_finance_pi", { order: "created_at", limit: 50 }));
    setShipping(await listTable<ShippingLabelRow>("ols_shipping_labels", { order: "created_at", limit: 50 }));
    setGates(await listTable<GateScanRow>("ols_gate_scans", { order: "scanned_at", limit: 50 }));
    setPrinters(await listTable<PrinterRow>("ols_printers"));
    setScans(await listTable<ScanHistoryRow>("ols_scan_history", { order: "created_at", limit: 25 }));
    setPrintLogs(await listTable<PrintLogRow>("ols_print_logs", { order: "created_at", limit: 25 }));
    setReprints(await listTable<ReprintRow>("ols_reprint_requests", { order: "created_at", limit: 50 }));
  }
  useEffect(() => { reload(); const t = setInterval(reload, 30_000); return () => clearInterval(t); }, []);

  const today = new Date().toDateString();
  type DatedRow = { created_at?: string; packed_at?: string; cleared_at?: string };
  function todays<T extends DatedRow>(rows: T[], key: keyof DatedRow = "created_at"): T[] {
    return rows.filter(r => r[key] && new Date(r[key] as string).toDateString() === today);
  }
  const failedScansToday = todays(scans).filter(s => s.result && s.result !== "green").length;
  const reprintsToday = todays(reprints).length;
  const pendingDispatch = shipping.filter(s => s.status !== "dispatched").length;
  const cleared = gates.filter(g => g.result === "green").length;
  const held = gates.filter(g => g.result === "red").length;
  const printersOnline = printers.filter(p => p.status === "online").length;

  const cards: CardDef[] = [
    { label: "Label commands generated today", value: todays(printLogs).length, hint: `${printLogs.length} total`, tone: "primary", icon: Factory },
    { label: "Cartons packed today", value: todays(cartons, "packed_at").length, hint: `${cartons.length} total`, tone: "gold", icon: PackageCheck },
    { label: "Pending gate dispatch", value: pendingDispatch, hint: `${shipping.length} shipping labels`, icon: Truck },
    { label: "Reprints raised today", value: reprintsToday, hint: `${reprints.filter(r => r.status === "pending").length} pending`, icon: RotateCcw },
    { label: "Printers online", value: `${printersOnline}/${printers.length}`, icon: Printer },
    { label: "Failed scans today", value: failedScansToday, tone: "muted", icon: ShieldAlert },
    { label: "Gate cleared / held", value: `${cleared} / ${held}`, icon: ScanLine },
    { label: "PI cleared today", value: todays(pis, "cleared_at").length, icon: Receipt },
  ];

  // Activity feed: union of recent scans, print logs, gate scans
  const activity = [
    ...scans.slice(0, 15).map(s => ({ id: `s-${s.id}`, when: s.created_at, kind: "scan", text: `${s.scan_context || "scan"} · ${(s.scan_value || "").slice(0, 24)}`, status: s.result })),
    ...printLogs.slice(0, 15).map(p => ({ id: `p-${p.id}`, when: p.created_at, kind: "print", text: `${p.is_reprint ? "Reprint" : "Print"} · ${p.ref_type}`, status: p.success ? "green" : "red" })),
    ...gates.slice(0, 15).map(g => ({ id: `g-${g.id}`, when: g.scanned_at || g.created_at, kind: "gate", text: `Gate · ${(g.qr_ref || "").slice(0, 22)}`, status: g.result })),
  ].filter(a => a.when).sort((a, b) => (a.when! < b.when! ? 1 : -1)).slice(0, 25);

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Control Tower" description="Live view of production, packing, finance, gate flow and printer health. Auto-refreshes every 30s." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="ols-card p-4">
            <div className="flex items-start justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                c.tone === "primary" ? "bg-gradient-primary text-primary-foreground"
                : c.tone === "gold" ? "bg-gradient-gold text-accent-foreground"
                : "bg-secondary text-secondary-foreground"}`}>
                <c.icon size={18} />
              </div>
            </div>
            <p className="ols-stat-num mt-3">{c.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.label}</p>
            {c.hint && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{c.hint}</p>}
          </div>
        ))}
      </div>

      {/* Printer status strip */}
      <section className="mt-6 ols-card p-4">
        <p className="ols-section-title mb-2">Printers</p>
        {printers.length === 0 ? <p className="text-sm text-muted-foreground">No printers configured.</p> : (
          <div className="flex flex-wrap gap-2">
            {printers.map(p => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl border bg-surface px-3 py-2">
                <Printer size={14} className="text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.model} · {p.command_lang}</p>
                </div>
                <StatusPill status={p.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="ols-card p-5 lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <p className="ols-section-title">Recent activity</p>
              <h3 className="text-base font-semibold">Floor, prints, gate</h3>
            </div>
            <Activity size={16} className="text-muted-foreground" />
          </header>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Activity will appear here.</p>
          ) : (
            <ul className="divide-y">
              {activity.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono uppercase text-[9px] text-secondary-foreground">{a.kind}</span>
                  <span className="flex-1 truncate">{a.text}</span>
                  <span className="text-[10px] text-muted-foreground">{a.when ? new Date(a.when).toLocaleTimeString() : ""}</span>
                  {a.status && <StatusPill status={a.status} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ols-card p-5">
          <p className="ols-section-title">Recent labels</p>
          <h3 className="mb-3 text-base font-semibold">Latest origin labels</h3>
          {labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No production yet.</p>
          ) : (
            <div className="space-y-2">
              {labels.slice(0, 6).map(l => (
                <div key={l.id} className="flex items-center justify-between rounded-xl border bg-surface px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{l.label_no}</p>
                    <p className="truncate text-xs font-medium">{l.product_name || l.metadata?.product_name || "—"}</p>
                  </div>
                  <StatusPill status={l.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
