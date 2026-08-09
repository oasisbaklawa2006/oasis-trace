import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listTable, insertRow } from "@/lib/data";
import { num } from "@/lib/numbering";
import { LabelPreview } from "@/components/LabelPreview";
import { Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/StatusPill";
import { useNavigate } from "react-router-dom";
import type { Department, ProductCache, ProductionBatch, ProductionLabel } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export default function ProductionEntry() {
  const nav = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [products, setProducts] = useState<ProductCache[]>([]);
  const [recent, setRecent] = useState<ProductionLabel[]>([]);
  const [form, setForm] = useState({
    department_id: "", product_id: "", batch_no: num.batch(),
    net_weight: "", gross_weight: "", tray_count: "1",
    mfg_date: new Date().toISOString().slice(0, 10),
    shift: "A", shelf_life_days: "90", qc_status: "pending",
    operator_name: "", remarks: "",
  });
  const [lastBatch, setLastBatch] = useState<ProductionLabel[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setDepartments(await listTable<Department>("ols_departments"));
      setProducts(await listTable<ProductCache>("ols_products_cache"));
      setRecent(await listTable<ProductionLabel>("ols_production_labels", { order: "created_at", limit: 8 }));
    })();
  }, []);

  const product = useMemo(() => products.find(p => p.id === form.product_id), [products, form.product_id]);

  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.department_id || !form.product_id || !form.net_weight) {
      toast.error("Department, product and net weight are required");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const batch = await insertRow<ProductionBatch>("ols_production_batches", {
        batch_no: form.batch_no,
        product_id: form.product_id,
        department_id: form.department_id,
        shift: form.shift,
        mfg_date: form.mfg_date,
        shelf_life_days: Number(form.shelf_life_days),
        qc_status: form.qc_status,
        remarks: form.remarks,
      });
      const trayCount = Math.max(1, Number(form.tray_count));
      const created: ProductionLabel[] = [];
      for (let i = 0; i < trayCount; i++) {
        const labelNo = num.productionLabel();
        const mfg = new Date(form.mfg_date);
        const best = new Date(mfg); best.setDate(best.getDate() + Number(form.shelf_life_days || 0));
        const label = await insertRow<ProductionLabel>("ols_production_labels", {
          label_no: labelNo,
          batch_id: batch.id,
          product_id: form.product_id,
          department_id: form.department_id,
          tray_serial: `T-${i + 1}`,
          net_weight: Number(form.net_weight),
          gross_weight: Number(form.gross_weight || form.net_weight),
          mfg_date: form.mfg_date,
          best_before: best.toISOString().slice(0, 10),
          qc_status: form.qc_status,
          operator_name: form.operator_name,
          status: "active",
          metadata: { product_name: product?.name, sku: product?.sku, department: departments.find(d => d.id === form.department_id)?.name },
        });
        await insertRow("ols_stock_units", { production_label_id: label.id, current_location: "store", current_status: "in_stock" });
        await insertRow("ols_inventory_movements", {
          production_label_id: label.id, from_location: "production", to_location: "store",
          movement_type: "production_inward", reference_no: batch.batch_no,
        });
        await insertRow("ols_print_logs", { ref_type: "production_label", ref_id: label.id, success: true });
        created.push(label);
      }
      setLastBatch(created);
      setRecent(await listTable<ProductionLabel>("ols_production_labels", { order: "created_at", limit: 8 }));
      toast.success(`Printed ${created.length} production label${created.length > 1 ? "s" : ""}`, {
        description: "Stock inward created automatically.",
      });
      setForm(f => ({ ...f, batch_no: num.batch() }));
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to save production labels");
      setSubmitError(msg);
      toast.error(msg, { duration: Infinity });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Production"
        title="Production Entry & Origin Label"
        description="Every tray gets a unique production label — the root of all traceability."
        actions={<Button variant="ghost" onClick={() => nav("/cartons")}>Go to Cartonization →</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="ols-card p-5 lg:col-span-3">
          <h3 className="mb-4 text-sm font-semibold">Batch details</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Department">
              <Select value={form.department_id} onValueChange={v => update("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Product / SKU">
              <Select value={form.product_id} onValueChange={v => {
                const p = products.find(x => x.id === v);
                setForm(f => ({ ...f, product_id: v, net_weight: String(p?.default_net_weight ?? f.net_weight), gross_weight: String(p?.default_gross_weight ?? f.gross_weight), shelf_life_days: String(p?.shelf_life_days ?? f.shelf_life_days) }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {p.sku}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Batch number"><Input value={form.batch_no} onChange={e => update("batch_no", e.target.value)} className="font-mono" /></Field>
            <Field label="Tray / box count"><Input type="number" min={1} value={form.tray_count} onChange={e => update("tray_count", e.target.value)} /></Field>
            <Field label="Net weight (kg)"><Input type="number" step="0.01" value={form.net_weight} onChange={e => update("net_weight", e.target.value)} /></Field>
            <Field label="Gross weight (kg)"><Input type="number" step="0.01" value={form.gross_weight} onChange={e => update("gross_weight", e.target.value)} /></Field>
            <Field label="Manufacturing date"><Input type="date" value={form.mfg_date} onChange={e => update("mfg_date", e.target.value)} /></Field>
            <Field label="Shelf life (days)"><Input type="number" value={form.shelf_life_days} onChange={e => update("shelf_life_days", e.target.value)} /></Field>
            <Field label="Shift">
              <Select value={form.shift} onValueChange={v => update("shift", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="A">Shift A</SelectItem><SelectItem value="B">Shift B</SelectItem><SelectItem value="C">Shift C</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="QC status">
              <Select value={form.qc_status} onValueChange={v => update("qc_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="passed">Passed</SelectItem><SelectItem value="hold">Hold</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Operator name" className="md:col-span-2"><Input value={form.operator_name} onChange={e => update("operator_name", e.target.value)} placeholder="e.g. Ali Hassan" /></Field>
            <Field label="Remarks" className="md:col-span-2"><Textarea rows={2} value={form.remarks} onChange={e => update("remarks", e.target.value)} /></Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={generate} disabled={isSubmitting} className="bg-gradient-primary text-primary-foreground shadow-elevated"><Save size={16} className="mr-1.5" /> Generate & Print Labels</Button>
          </div>
          {submitError && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <strong>Save failed:</strong> {submitError}
            </div>
          )}
        </div>

        <div className="ols-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Live label preview · 75 × 50 mm</h3>
          <div className="flex justify-center py-3">
            <LabelPreview
              widthMm={75} heightMm={50}
              eyebrow="Production · 75 × 50 mm"
              title={product?.name || "Cashew Pyramid Baklawa"}
              lines={[
                `SKU ${product?.sku || "CPB-5000"}  Batch ${form.batch_no}`,
                `MFG ${form.mfg_date}  Shelf ${form.shelf_life_days}d`,
                `Net ${form.net_weight || "—"} kg  Gross ${form.gross_weight || "—"} kg`,
              ]}
              barcode={lastBatch[0]?.label_no || "PL-PREVIEW-0001"}
            />
          </div>

          {lastBatch.length > 0 && (
            <div className="mt-5">
              <p className="ols-section-title mb-2">Last batch printed</p>
              <ul className="space-y-1.5">
                {lastBatch.map(l => (
                  <li key={l.id} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs">
                    <span className="font-mono">{l.label_no}</span>
                    <span className="text-muted-foreground">{l.tray_serial}</span>
                    <Printer size={12} className="text-success" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section className="mt-8 ols-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Recent production labels</h3>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet. Create your first batch above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Label #</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Tray</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">QC</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{r.label_no}</td>
                    <td className="px-3 py-2">{r.metadata?.product_name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.tray_serial}</td>
                    <td className="px-3 py-2">{r.net_weight} kg</td>
                    <td className="px-3 py-2"><StatusPill status={r.qc_status} /></td>
                    <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
