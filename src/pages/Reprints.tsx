import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";
import { RotateCcw } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";

export default function Reprints() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { (async () => setRows(await listTable("ols_reprint_requests", { order: "created_at" })))(); }, []);
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Reprint Requests" description="Sensitive reprints (after dispatch, after invoice) carry an audit trail. Future: admin approval." />
      <div className="ols-card p-5">
        {rows.length === 0 ? <EmptyState icon={<RotateCcw />} title="No reprint requests" description="Requests raised from print logs will appear here for approval." /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Approver</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 capitalize">{r.ref_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.ref_id?.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-xs">{r.reason}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.approver || "—"}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
