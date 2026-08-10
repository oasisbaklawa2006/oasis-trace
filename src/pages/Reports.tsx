import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REPORT_BUILDERS, defaultRange, HARD_ROW_CAP, type ReportKey } from "@/lib/reports";
import type { Report, ReportCellValue } from "@/lib/csvExport";
import { downloadCSV, printA4 } from "@/lib/csvExport";
import { exportPDF, type Watermark } from "@/lib/pdfExport";
import { Download, Printer, FileText, BarChart3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { errorMessage } from "@/lib/utils";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default function Reports() {
  const [key, setKey] = useState<ReportKey>("dispatch");
  const [term, setTerm] = useState("");
  // Default last 7 days — prevents accidental full-table scans on launch.
  const initial = defaultRange();
  const [from, setFrom] = useState(ymd(initial.from!));
  const [to, setTo] = useState(ymd(initial.to!));
  const [watermark, setWatermark] = useState<Watermark | "NONE">("NONE");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const cfg = REPORT_BUILDERS[key];

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      const range = {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
      const r = await cfg.build(term, range);
      setReport(r);
      if (r.meta?.truncated) {
        toast.warning("Dataset too large", { description: `Showing ${r.meta.cap} of ${r.meta.total}. Narrow filters.` });
      } else if (r.rows.length === 0) {
        toast.info("Report generated · no rows match the filters");
      } else {
        toast.success(`${r.rows.length} row(s)`);
      }
    } catch (e: unknown) { toast.error("Report failed", { description: errorMessage(e) }); }
    finally { setBusy(false); }
  }, [cfg, term, from, to]);

  // Auto-run only when the report kind changes — from/to/term are applied via
  // the explicit Generate button, not on every keystroke.
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Audit Report Engine" description="Bounded by default to the last 7 days. Hard cap of 5000 rows protects the browser; narrow filters for archival exports." />

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
          <p className="mt-4 text-[10px] text-muted-foreground">
            Default window: last 7 days. Hard cap: {HARD_ROW_CAP.toLocaleString()} rows.
          </p>
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
            <div>
              <Label className="mb-1.5 block text-xs">Watermark</Label>
              <Select value={watermark} onValueChange={(v) => setWatermark(v as Watermark | "NONE")}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="INTERNAL">INTERNAL</SelectItem>
                  <SelectItem value="VERIFIED">VERIFIED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={busy} className="bg-gradient-primary text-primary-foreground">
              {busy ? "Generating…" : "Generate"}
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" disabled={!report} onClick={() => report && downloadCSV(report)}><Download size={14} className="mr-1" /> CSV</Button>
              <Button variant="outline" size="sm" disabled={!report} onClick={() => report && exportPDF(report, { watermark: watermark === "NONE" ? undefined : watermark })}><FileText size={14} className="mr-1" /> PDF</Button>
              <Button variant="outline" size="sm" disabled={!report} onClick={printA4}><Printer size={14} className="mr-1" /> Print A4</Button>
            </div>
          </div>

          {report?.meta?.truncated && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle size={14} className="mt-0.5" />
              <div>
                <p className="font-semibold">Dataset too large — narrow filters.</p>
                <p className="opacity-80">Showing {report.meta.cap} of {report.meta.total} rows. Tighten the date range or search term for archival accuracy.</p>
              </div>
            </div>
          )}

          <div className="mt-5 print-sheet relative">
            {watermark !== "NONE" && report && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center print:flex">
                <span className="rotate-[-22deg] select-none text-[120px] font-bold uppercase tracking-widest text-destructive/10">
                  {watermark}
                </span>
              </div>
            )}
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

function format(v: ReportCellValue): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}
