import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { listTable, insertRow, updateRow } from "@/lib/data";
import { num } from "@/lib/numbering";
import { Tag, Printer } from "lucide-react";
import { toast } from "sonner";
import { LabelPreview } from "@/components/LabelPreview";
import { StatusPill } from "@/components/StatusPill";
import { ReprintModal } from "@/components/ReprintModal";
import type { Carton, FinancePi, ShippingLabelRow } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export default function ShippingLabel() {
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [pis, setPis] = useState<FinancePi[]>([]);
  const [labels, setLabels] = useState<ShippingLabelRow[]>([]);
  const [reprint, setReprint] = useState<ShippingLabelRow | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { reload(); }, []);
  async function reload() {
    setCartons(await listTable<Carton>("ols_cartons"));
    setPis(await listTable<FinancePi>("ols_finance_pi"));
    setLabels(await listTable<ShippingLabelRow>("ols_shipping_labels", { order: "created_at" }));
  }

  const eligible = cartons.filter(c => c.status === "invoiced");

  async function generate(carton: Carton) {
    try {
      setLabelError(null);
      setIsSubmitting(true);
      const pi = pis.find(p => p.order_ref === carton.order_ref && p.status === "cleared");
      const lbl = await insertRow<ShippingLabelRow>("ols_shipping_labels", {
        shipping_no: num.shipping(),
        carton_id: carton.id,
        pi_id: pi?.id,
        consignor: "Oasis Baklawa LLC",
        consignee: carton.customer_name,
        address: "—",
        invoice_ref: pi?.invoice_ref,
        qr_ref: num.qrRef(),
        status: "printed",
      });
      await updateRow("ols_cartons", carton.id, { status: "shipping_labelled" });
      await insertRow("ols_print_logs", { ref_type: "shipping", ref_id: lbl.id, success: true });
      toast.success(`Shipping label ${lbl.shipping_no} generated`);
      reload();
    } catch (err: unknown) {
      const msg = errorMessage(err, "Failed to generate shipping label");
      setLabelError(msg);
      toast.error(msg, { duration: Infinity });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Dispatch" title="Shipping Label Printing" description="Generated only after finance clearance. QR carries an opaque reference — never invoice or payment data." />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Cartons awaiting shipping label</h3>
          {labelError && (
            <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <strong>Label error:</strong> {labelError}
            </div>
          )}
          {eligible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">All invoiced cartons have shipping labels.</p>
          ) : (
            <ul className="space-y-2">
              {eligible.map(c => (
                <li key={c.id} className="flex items-center justify-between rounded-xl border bg-surface px-3 py-2.5">
                  <div>
                    <p className="font-mono text-xs">{c.carton_no}</p>
                    <p className="text-xs text-muted-foreground">{c.order_ref} · {c.customer_name}</p>
                  </div>
                  <Button size="sm" onClick={() => generate(c)} disabled={isSubmitting} className="bg-gradient-primary text-primary-foreground"><Tag size={14} className="mr-1" /> Generate</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Recent shipping labels · 100 × 150 mm</h3>
          {labels.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> :
            <ul className="space-y-4">
              {labels.slice(0, 4).map(l => (
                <div key={l.id} className="rounded-xl border bg-surface p-3">
                  <div className="flex items-start gap-3">
                    <LabelPreview
                      widthMm={100} heightMm={150}
                      eyebrow="Shipping · 100 × 150 mm"
                      title={l.consignee}
                      lines={[
                        `From ${l.consignor || "—"}`,
                        `Invoice ${l.invoice_ref || "—"}`,
                        l.shipping_no,
                      ]}
                      barcode={l.shipping_no}
                      qr={l.qr_ref}
                      scale={0.45}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-semibold">{l.shipping_no}</p>
                      <p className="text-xs text-muted-foreground">To {l.consignee}</p>
                      <p className="text-[11px] text-muted-foreground">Invoice {l.invoice_ref || "—"}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <StatusPill status={l.status} />
                        <Button size="sm" variant="ghost" onClick={() => setReprint(l)}>
                          <Printer size={14} className="mr-1" /> Reprint
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </ul>}
        </section>
      </div>

      {reprint && (
        <ReprintModal
          open={!!reprint}
          onOpenChange={(o) => !o && setReprint(null)}
          refType="shipping"
          refId={reprint.id}
          refLabel={reprint.shipping_no}
          onConfirmed={() => reload()}
        />
      )}
    </div>
  );
}
