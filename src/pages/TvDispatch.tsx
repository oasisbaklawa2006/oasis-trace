import { useCallback, useState } from "react";
import { captureLeap13Evidence } from "@/lib/leap13Evidence";
import { countTable, getMode, listTable } from "@/lib/data";
import { useSerializedPoll } from "@/hooks/useSerializedPoll";
import { supabaseConfigured } from "@/lib/supabase";
import type { Carton } from "@/lib/types";
import { PackageCheck, Truck } from "lucide-react";

const REFRESH_MS = 10_000;
const DETAIL_LIMIT = 12;

/** Read-only dispatch kiosk surface — Trace TV role. */
export default function TvDispatch() {
  const [detailCartons, setDetailCartons] = useState<Carton[]>([]);
  const [packed, setPacked] = useState(0);
  const [dispatched, setDispatched] = useState(0);
  const [shippingReady, setShippingReady] = useState(0);
  const [dataSource, setDataSource] = useState<"live" | "demo">("demo");

  const load = useCallback(async () => {
    try {
      const [packedCount, dispatchedCount, shippingReadyCount, recentCartons] = await Promise.all([
        countTable("ols_cartons", { column: "status", op: "in", value: ["packed", "finance_received"] }),
        countTable("ols_cartons", { column: "status", op: "eq", value: "dispatched" }),
        countTable("ols_shipping_labels", { column: "status", op: "neq", value: "dispatched" }),
        listTable<Carton>("ols_cartons", { order: "created_at", limit: DETAIL_LIMIT }),
      ]);
      if (supabaseConfigured && getMode() !== "live") return;
      setPacked(packedCount);
      setDispatched(dispatchedCount);
      setShippingReady(shippingReadyCount);
      setDetailCartons(recentCartons);
      setDataSource(supabaseConfigured ? "live" : "demo");
      captureLeap13Evidence("tv-dispatch", "refresh", {
        packed: packedCount,
        dispatched: dispatchedCount,
        shippingReady: shippingReadyCount,
        detailRows: recentCartons.length,
        dataSource: supabaseConfigured ? "live" : "demo",
      });
    } catch {
      // Discard partial refresh — do not commit mixed-source kiosk state.
    }
  }, []);

  useSerializedPoll(load, REFRESH_MS);

  return (
    <div className="min-h-screen bg-background p-6 tv-surface">
      <header className="mb-6">
        <p className="text-sm font-semibold tracking-[0.2em] text-muted-foreground">OASIS TRACE</p>
        <h1 className="text-4xl font-bold">Dispatch — {dataSource === "live" ? "Live" : "Demo"}</h1>
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
        {detailCartons.map(c => (
          <div key={c.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
            <span className="font-mono font-semibold">{c.carton_no}</span>
            <span className="text-sm uppercase text-muted-foreground">{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
