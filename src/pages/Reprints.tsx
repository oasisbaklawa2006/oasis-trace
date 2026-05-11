import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";
import { RotateCcw } from "lucide-react";

export default function Reprints() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { (async () => setRows(await listTable("ols_reprint_requests", { order: "created_at" })))(); }, []);
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Reprint Requests" description="Sensitive reprints (after dispatch, after invoice) require admin approval." />
      <div className="ols-card p-5">
        {rows.length === 0 ? <EmptyState icon={<RotateCcw />} title="No reprint requests" description="Requests raised from print logs will appear here for approval." /> : (
          <ul className="space-y-2">
            {rows.map(r => <li key={r.id} className="rounded-xl border bg-surface px-3 py-2 text-sm">{r.reason} · <span className="text-muted-foreground">{r.status}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
