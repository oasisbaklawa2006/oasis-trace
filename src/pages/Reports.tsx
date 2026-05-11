import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REPORT_BUILDERS, type ReportKey } from "@/lib/reports";
import type { Report } from "@/lib/exporters";
import { downloadCSV, exportPDF, printA4 } from "@/lib/exporters";
import { Download, Printer, FileText, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";

export default function Reports() {
  const [key, setKey] = useState<ReportKey>("dispatch");
  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const cfg = REPORT_BUILDERS[key];

  async function generate() {
    setBusy(true);
    try {
      const range = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
      const r = await (cfg as any).build(term, range);
      setReport(r);
      if (r.rows.length === 0) toast.info("Report generated · no rows match the filters");
      else toast.success(`${r.rows.length} row(s)`);
    } catch (e: any) { toast.error("Report failed", { description: e?.message }); }
    finally { setBusy(false); }
  }

  // Auto-generate on first load
  useEffect(() => { generate(); /* eslint-disable-next-line */ }, [key]);

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Audit Report Engine" description="Export-grade reports for batch traceability, carton movement, dispatch, gate clearance, reprints and finance discrepancies." />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="ols-card p-4">
          <p className="ols-section-title mb-2">Report</p>
          <div className="space-y-1">
            {(Object.entries(REPORT_BUILDERS) as Array<[ReportKey, typeof REPORT_BUILDERS[ReportKey]]>).map(([k, v]) => (
              <button key={k} onClick={() => setKey(k)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${key === k ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                <BarChart3 size={14} className="opacity-80" /> {v.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="ols-card p-5">
          <div className="flex flex-wrap items-end gap-3">
            {cfg.needsTerm && (
              <div className="flex-1 min-w-[180px]">
                <Label className="mb-1.5 block text-xs">Search term (label / batch / SKU)</Label>
                <Input value={term} onChange={e => setTerm(e.target.value)} placeholder="e.g. PL-20260511-9303" className="font-mono" />
              </div>
            )}
            {!cfg.needsTerm && (
              <>
                <div><Label className="mb-1.5 block text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
                <div><Label className="mb-1.5 block text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
              </>
            )}
            <Button onClick={generate} disabled={busy} className="bg-gradient-primary text-primary-foreground">
              {busy ? "Generating…" : "Generate"}
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" disabled={!report} onClick={() => report && downloadCSV(report)}><Download size={14} className="mr-1" /> CSV</Button>
              <Button variant="outline" size="sm" disabled={!report} onClick={() => report && exportPDF(report)}><FileText size={14} className="mr-1" /> PDF</Button>
              <Button variant="outline" size="sm" disabled={!report} onClick={printA4}><Printer size={14} className="mr-1" /> Print A4</Button>
            </div>
          </div>

          <div className="mt-5 print-sheet">
            {!report ? <EmptyState title="No report yet" description="Generate to preview." /> : (
              <>
                <header className="mb-3 flex items-baseline justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold">{report.title}</h3>
                    {report.subtitle && <p className="text-xs text-muted-foreground">{report.subtitle}</p>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{report.generatedAt}</p>
                </header>
                {report.rows.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No rows.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-muted/50 text-left uppercase tracking-wider text-muted-foreground">
                        <tr>{report.columns.map(c => <th key={c.key} className="px-2.5 py-2">{c.header}</th>)}</tr>
                      </thead>
                      <tbody>
                        {report.rows.map((r, i) => (
                          <tr key={i} className="border-t">
                            {report.columns.map(c => <td key={c.key} className="px-2.5 py-1.5">{format(r[c.key])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function format(v: any): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}
