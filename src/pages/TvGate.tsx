import { useCallback, useState } from "react";
import { captureLeap13Evidence } from "@/lib/leap13Evidence";
import { listTable } from "@/lib/data";
import { useSerializedPoll } from "@/hooks/useSerializedPoll";
import type { GateScanRow } from "@/lib/types";
import { ShieldCheck, ShieldAlert } from "lucide-react";

const REFRESH_MS = 10_000;

/** Read-only gate kiosk surface — Trace TV role, not Central admin TV. */
export default function TvGate() {
  const [history, setHistory] = useState<GateScanRow[]>([]);
  const [latest, setLatest] = useState<GateScanRow | null>(null);

  const load = useCallback(async () => {
    const rows = await listTable<GateScanRow>("ols_gate_scans", { order: "scanned_at", limit: 20 });
    setHistory(rows);
    setLatest(rows[0] ?? null);
    captureLeap13Evidence("tv-gate", "refresh", {
      rows: rows.length,
      latestResult: rows[0]?.result ?? null,
    });
  }, []);

  useSerializedPoll(load, REFRESH_MS);

  const greens = history.filter(h => h.result === "green").length;
  const reds = history.length - greens;

  return (
    <div className="min-h-screen bg-background p-6 tv-surface">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-muted-foreground">OASIS TRACE</p>
          <h1 className="text-4xl font-bold">Gate Scan — Live</h1>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>Auto-refresh {REFRESH_MS / 1000}s</p>
          <p>{greens} cleared · {reds} held</p>
        </div>
      </header>

      <div
        className={`mb-8 rounded-3xl border-4 p-12 text-center ${
          !latest ? "border-dashed border-border" :
          latest.result === "green" ? "border-success bg-success/10" : "border-destructive bg-destructive/10"
        }`}
      >
        {!latest ? (
          <p className="text-2xl text-muted-foreground">Awaiting gate scan…</p>
        ) : latest.result === "green" ? (
          <div className="text-success">
            <ShieldCheck size={96} className="mx-auto mb-4" />
            <p className="text-5xl font-bold">CLEARED</p>
            <p className="mt-2 font-mono text-xl">{latest.qr_ref}</p>
          </div>
        ) : (
          <div className="text-destructive">
            <ShieldAlert size={96} className="mx-auto mb-4" />
            <p className="text-5xl font-bold">HOLD</p>
            <p className="mt-2 text-xl">{latest.reason}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {history.slice(0, 8).map(h => (
          <div
            key={h.id}
            className={`rounded-xl border-2 px-4 py-3 ${
              h.result === "green" ? "border-success/50 bg-success/5" : "border-destructive/50 bg-destructive/5"
            }`}
          >
            <p className="truncate font-mono text-sm">{h.qr_ref}</p>
            <p className="mt-1 text-lg font-bold uppercase">{h.result}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
