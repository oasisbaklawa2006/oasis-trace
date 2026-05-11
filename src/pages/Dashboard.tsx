import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { Factory, PackageCheck, Receipt, Tag, ShieldAlert, Printer, History, Activity } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";

interface CardDef { label: string; value: number | string; hint?: string; tone?: "primary" | "gold" | "muted"; icon: any; }

export default function Dashboard() {
  const [labels, setLabels] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);
  const [dpls, setDpls] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [shipping, setShipping] = useState<any[]>([]);
  const [gateHolds, setGateHolds] = useState<any[]>([]);
  const [printers, setPrinters] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLabels(await listTable("ols_production_labels", { order: "created_at", limit: 200 }));
      setCartons(await listTable("ols_cartons", { order: "created_at", limit: 200 }));
      setDpls(await listTable("ols_dpl_documents", { order: "created_at", limit: 50 }));
      setPis(await listTable("ols_finance_pi", { order: "created_at", limit: 50 }));
      setShipping(await listTable("ols_shipping_labels", { order: "created_at", limit: 50 }));
      const gs = await listTable<any>("ols_gate_scans", { order: "scanned_at", limit: 50 });
      setGateHolds(gs.filter(s => s.result === "red"));
      setPrinters(await listTable("ols_printers"));
      setScans(await listTable<any>("ols_scan_history", { order: "created_at", limit: 6 }));
    })();
  }, []);

  const today = new Date().toDateString();
  const todays = (rows: any[], key = "created_at") => rows.filter(r => r[key] && new Date(r[key]).toDateString() === today);

  const cards: CardDef[] = [
    { label: "Production labels today", value: todays(labels).length, hint: `${labels.length} total`, tone: "primary", icon: Factory },
    { label: "Cartons packed today", value: todays(cartons).length, hint: `${cartons.length} total`, tone: "gold", icon: PackageCheck },
    { label: "DPL pending finance", value: dpls.filter(d => d.status !== "cleared").length, icon: Receipt },
    { label: "PI pending clearance", value: pis.filter(p => p.status === "pending").length, icon: Receipt },
    { label: "Shipping labels pending", value: cartons.filter(c => c.status === "invoiced").length, icon: Tag },
    { label: "Gate holds (RED)", value: gateHolds.length, tone: "muted", icon: ShieldAlert },
    { label: "Printers online", value: `${printers.filter(p => p.status === "online").length}/${printers.length}`, icon: Printer },
    { label: "Reprint alerts", value: 0, icon: History },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Control Tower"
        description="Live view of production, packing, finance, and gate flow — every label traces back to its origin."
      />

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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="ols-card p-5 lg:col-span-2">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <p className="ols-section-title">Recent production</p>
              <h3 className="text-base font-semibold">Latest origin labels</h3>
            </div>
            <Activity size={16} className="text-muted-foreground" />
          </header>
          {labels.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No production yet — run the demo workflow from Production Entry.</p>
          ) : (
            <div className="space-y-2">
              {labels.slice(0, 6).map(l => (
                <div key={l.id} className="flex items-center justify-between rounded-xl border bg-surface px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-muted-foreground">{l.label_no}</p>
                    <p className="truncate text-sm font-medium">{l.product_name || l.metadata?.product_name || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{l.net_weight} kg</p>
                    <StatusPill status={l.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ols-card p-5">
          <p className="ols-section-title">Recent scans</p>
          <h3 className="mb-3 text-base font-semibold">Gate & floor activity</h3>
          {scans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Scans will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {scans.map((s: any) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <StatusPill status={s.result} />
                  <span className="font-mono text-muted-foreground">{(s.scan_value || "").slice(0, 18)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
