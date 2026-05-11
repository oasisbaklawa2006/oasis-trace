import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";
import { History } from "lucide-react";

export default function PrintLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { (async () => setLogs(await listTable("ols_print_logs", { order: "created_at" })))(); }, []);
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Print Logs & Reprint Control" description="Every print creates a log. Reprints require reason, user, count, and may trigger watermark." />
      <div className="ols-card p-5">
        {logs.length === 0 ? <EmptyState icon={<History />} title="No prints yet" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2">Reprint</th><th className="px-3 py-2">Result</th></tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 capitalize">{l.ref_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.ref_id?.slice(0, 8)}</td>
                  <td className="px-3 py-2">{l.is_reprint ? `× ${l.reprint_count}` : "—"}</td>
                  <td className="px-3 py-2">{l.success ? "✅" : "⚠"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
