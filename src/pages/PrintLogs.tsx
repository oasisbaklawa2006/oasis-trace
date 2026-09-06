import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { History, Printer } from "lucide-react";
import { ReprintModal } from "@/components/ReprintModal";
import type { PrintLogRow } from "@/lib/types";
import type { ReprintRefType } from "@/lib/reprintPolicy";
import { executeGovernedReprint, rebuildGovernedPrintRequest, NO_PHYSICAL_PRINT_NOTE } from "@/lib/governedPrint";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

export default function PrintLogs() {
  const [logs, setLogs] = useState<PrintLogRow[]>([]);
  const [reprint, setReprint] = useState<PrintLogRow | null>(null);

  useEffect(() => { reload(); }, []);
  async function reload() { setLogs(await listTable<PrintLogRow>("ols_print_logs", { order: "created_at" })); }

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Print Logs & Reprint Control" description="Every print creates a log. Reprints require reason, user, count, and apply a watermark." />
      <div className="ols-card p-5">
        {logs.length === 0 ? <EmptyState icon={<History />} title="No prints yet" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Reprint</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 capitalize">{l.ref_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.ref_id?.slice(0, 8)}</td>
                  <td className="px-3 py-2">{l.is_reprint ? `× ${l.reprint_count}` : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.metadata?.reason || "—"}</td>
                  <td className="px-3 py-2">{l.success ? "✅" : "⚠"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setReprint(l)}>
                      <Printer size={12} className="mr-1" /> Reprint
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reprint && (
        <ReprintModal
          open={!!reprint}
          onOpenChange={(o) => !o && setReprint(null)}
          refType={reprint.ref_type as ReprintRefType}
          refId={reprint.ref_id || ""}
          refLabel={`${reprint.ref_type} ${reprint.ref_id?.slice(0, 8)}`}
          onConfirmed={async ({ reason, watermark, reprintCount }) => {
            try {
              const rebuilt = await rebuildGovernedPrintRequest(
                reprint.ref_type as ReprintRefType,
                reprint.ref_id || "",
              );
              if ("code" in rebuilt) {
                toast.error("Reprint failed", { description: rebuilt.message });
                return;
              }
              const result = await executeGovernedReprint({
                surface: rebuilt.surface,
                refId: rebuilt.refId,
                barcodeIdentity: rebuilt.barcodeIdentity,
                payload: rebuilt.payload,
                qrIdentity: rebuilt.qrIdentity,
                reprintReason: reason,
                reprintCount,
                watermark,
                isReprint: true,
              });
              if (result.ok === false) {
                toast.error("Reprint command failed", { description: result.message });
                return;
              }
              toast.success("Reprint command generated", { description: NO_PHYSICAL_PRINT_NOTE });
              reload();
            } catch (e: unknown) {
              toast.error("Reprint failed", { description: errorMessage(e) });
            }
          }}
        />
      )}
    </div>
  );
}
