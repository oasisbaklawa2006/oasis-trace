import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listTable, insertRow, updateRow } from "@/lib/data";
import { ShieldCheck, ShieldAlert, ScanLine } from "lucide-react";

interface Result { kind: "green" | "red"; title: string; reason?: string; ref?: string; }

export default function GateScan() {
  const [scan, setScan] = useState("");
  const [labels, setLabels] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { reload(); inputRef.current?.focus(); }, []);
  async function reload() {
    setLabels(await listTable("ols_shipping_labels"));
    setCartons(await listTable("ols_cartons"));
    setPis(await listTable("ols_finance_pi"));
    setHistory(await listTable("ols_gate_scans", { order: "scanned_at", limit: 10 }));
  }

  async function check() {
    const ref = scan.trim();
    if (!ref) return;
    const lbl = labels.find(l => l.qr_ref === ref || l.shipping_no === ref);
    let res: Result;
    if (!lbl) res = { kind: "red", title: "REJECTED", reason: "Invalid reference / shipping label not found", ref };
    else {
      const ctn = cartons.find(c => c.id === lbl.carton_id);
      const pi = pis.find(p => p.id === lbl.pi_id);
      if (!ctn) res = { kind: "red", title: "REJECTED", reason: "Carton missing" };
      else if (ctn.status === "cancelled" || ctn.status === "held") res = { kind: "red", title: "HOLD", reason: `Carton status is ${ctn.status}` };
      else if (ctn.status === "dispatched") res = { kind: "red", title: "DUPLICATE", reason: "Carton already dispatched" };
      else if (!pi || pi.status !== "cleared") res = { kind: "red", title: "HOLD", reason: "PI not cleared" };
      else if (!pi.invoice_ref) res = { kind: "red", title: "HOLD", reason: "Invoice missing" };
      else {
        res = { kind: "green", title: "ALLOWED", ref: ctn.carton_no };
        await updateRow("ols_cartons", ctn.id, { status: "dispatched" });
        await insertRow("ols_inventory_movements", {
          production_label_id: null, from_location: "shipping", to_location: "dispatched",
          movement_type: "gate_clear", reference_no: ctn.carton_no,
        });
      }
    }
    await insertRow("ols_gate_scans", { qr_ref: ref, shipping_label_id: lbl?.id, result: res.kind, reason: res.reason });
    await insertRow("ols_scan_history", { scan_value: ref, scan_context: "gate", result: res.kind });
    setResult(res); setScan("");
    reload(); inputRef.current?.focus();
  }

  return (
    <div>
      <PageHeader eyebrow="Security" title="Exit Gate Scan Control" description="Scan shipping QR. Decision is GREEN allowed or RED hold with reason." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="ols-card p-6 lg:col-span-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef} value={scan} onChange={e => setScan(e.target.value)}
              onKeyDown={e => e.key === "Enter" && check()}
              placeholder="Scan QR reference or shipping label…"
              className="h-14 font-mono text-lg"
            />
            <Button onClick={check} className="h-14 px-6 bg-gradient-primary text-primary-foreground"><ScanLine size={20} /></Button>
          </div>

          <div className={`mt-6 rounded-2xl border-2 p-8 text-center transition-all ${
            !result ? "border-dashed border-border bg-surface-muted/30" :
            result.kind === "green" ? "border-success bg-success/10" : "border-destructive bg-destructive/10"
          }`}>
            {!result ? (
              <p className="text-sm text-muted-foreground">Awaiting scan…</p>
            ) : result.kind === "green" ? (
              <div className="text-success">
                <ShieldCheck size={64} className="mx-auto mb-2" />
                <p className="text-3xl font-bold tracking-wide">GREEN — {result.title}</p>
                <p className="mt-1 text-sm">Carton {result.ref} marked dispatched.</p>
              </div>
            ) : (
              <div className="text-destructive">
                <ShieldAlert size={64} className="mx-auto mb-2" />
                <p className="text-3xl font-bold tracking-wide">RED — {result.title}</p>
                <p className="mt-1 text-sm">{result.reason}</p>
              </div>
            )}
          </div>
        </div>

        <div className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Last 10 scans</h3>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="space-y-1.5">
              {history.map(h => (
                <li key={h.id} className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs ${h.result === "green" ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
                  <span className="font-mono">{(h.qr_ref || "").slice(0, 16)}</span>
                  <span className="font-semibold uppercase">{h.result}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
