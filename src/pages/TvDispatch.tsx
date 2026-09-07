import { useCallback, useState } from "react";
import { listTable } from "@/lib/data";
import { useSerializedPoll } from "@/hooks/useSerializedPoll";
import type { Carton, ShippingLabelRow } from "@/lib/types";
import { PackageCheck, Truck } from "lucide-react";

const REFRESH_MS = 10_000;

/** Read-only dispatch kiosk surface — Trace TV role. */
export default function TvDispatch() {
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [labels, setLabels] = useState<ShippingLabelRow[]>([]);

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      listTable<Carton>("ols_cartons", { order: "created_at", limit: 50 }),
      listTable<ShippingLabelRow>("ols_shipping_labels", { order: "created_at", limit: 50 }),
    ]);
    setCartons(c);
    setLabels(l);
  }, []);

  useSerializedPoll(load, REFRESH_MS);

  const packed = cartons.filter(c => c.status === "packed" || c.status === "finance_received").length;
  const dispatched = cartons.filter(c => c.status === "dispatched").length;
  const shippingReady = labels.filter(l => l.status !== "dispatched").length;

  return (
    <div className="min-h-screen bg-background p-6 tv-surface">
      <header className="mb-6">
        <p className="text-sm font-semibold tracking-[0.2em] text-muted-foreground">OASIS TRACE</p>
        <h1 className="text-4xl font-bold">Dispatch — Live</h1>
      </header>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-8 text-center">
          <PackageCheck size={48} className="mx-auto mb-2 text-primary" />
          <p className="text-5xl font-bold">{packed}</p>
          <p className="text-lg text-muted-foreground">Packed / finance-ready</p>
        </div>
        <div className="rounded-2xl border-2 border-warning/30 bg-warning/5 p-8 text-center">
          <Truck size={48} className="mx-auto mb-2 text-warning" />
          <p className="text-5xl font-bold">{shippingReady}</p>
          <p className="text-lg text-muted-foreground">Shipping labels active</p>
        </div>
        <div className="rounded-2xl border-2 border-success/30 bg-success/5 p-8 text-center">
          <Truck size={48} className="mx-auto mb-2 text-success" />
          <p className="text-5xl font-bold">{dispatched}</p>
          <p className="text-lg text-muted-foreground">Dispatched cartons</p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {cartons.slice(0, 12).map(c => (
          <div key={c.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
            <span className="font-mono font-semibold">{c.carton_no}</span>
            <span className="text-sm uppercase text-muted-foreground">{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
