import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertRow } from "@/lib/data";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  canOverride, createPendingRequest, getReprintCount, requiresApproval,
  type ReprintRefType,
} from "@/lib/reprintPolicy";

const REASONS = [
  "Damaged label", "Printer jam", "Wrong printer / template",
  "Lost in handling", "Audit / verification", "Other",
];

export const DUPLICATE_WATERMARK = "DUPLICATE COPY";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refType: ReprintRefType;
  refId: string;
  refLabel: string;
  /** Called only when reprint is approved (immediate or supervisor override). */
  onConfirmed?: (info: { reason: string; approver?: string; watermark: string }) => void;
}

/**
 * Reprint reason modal with approval policy:
 * - 1st reprint: instant approval, log only.
 * - 2nd+ reprint: queued as `pending` unless a supervisor/admin overrides.
 * Watermark "DUPLICATE COPY" is always passed through to the print payload.
 */
export function ReprintModal({ open, onOpenChange, refType, refId, refLabel, onConfirmed }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [approver, setApprover] = useState("");
  const [override, setOverride] = useState(false);
  const [priorCount, setPriorCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(REASONS[0]); setDetails(""); setApprover(""); setOverride(false);
    getReprintCount(refType, refId).then(setPriorCount).catch(() => setPriorCount(0));
  }, [open, refType, refId]);

  const needsApproval = requiresApproval(priorCount);
  const overrideAllowed = canOverride();

  async function confirm() {
    setBusy(true);
    try {
      const finalReason = reason === "Other" ? (details || "Other") : reason;
      const parsed = { category: finalReason, details: details || undefined, approver: approver || undefined };

      // Case 1: needs approval AND no override → queue as pending and stop.
      if (needsApproval && !(override && overrideAllowed)) {
        await createPendingRequest({ refType, refId, refLabel, parsed });
        toast.warning("Reprint queued for supervisor approval", { description: refLabel });
        onOpenChange(false);
        return;
      }

      // Case 2: instant approval or supervisor override → log + proceed.
      const reqRow = await insertRow<any>("ols_reprint_requests", {
        ref_type: refType, ref_id: refId,
        reason: packForRow(parsed, override && overrideAllowed),
        status: "approved",
      }).catch((e: any) => { console.warn("reprint request insert skipped:", e?.message); return null; });

      await insertRow("ols_print_logs", {
        ref_type: refType, ref_id: refId,
        success: true, is_reprint: true, reprint_count: priorCount + 1,
        reason: finalReason,
      });

      try {
        await insertRow("ols_audit_logs", {
          action: override ? "reprint_override" : "reprint_immediate",
          entity_type: refType, entity_id: refId,
          details: { request_id: reqRow?.id, reason: finalReason, approver, override },
        });
      } catch { /* ignore */ }

      toast.success(override ? "Supervisor override · reprint logged" : "Reprint logged", { description: refLabel });
      onConfirmed?.({ reason: finalReason, approver, watermark: DUPLICATE_WATERMARK });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Reprint failed", { description: e?.message });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning" /> Confirm reprint
          </DialogTitle>
          <DialogDescription>
            Reprinting <span className="font-mono text-foreground">{refLabel}</span>. A "DUPLICATE COPY"
            watermark will be applied. Prior reprints: <strong>{priorCount}</strong>.
          </DialogDescription>
        </DialogHeader>

        {needsApproval && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-warning-foreground">
              <ShieldCheck size={14} /> Approval required
            </div>
            <p className="mt-1 text-warning-foreground/80">
              Second reprint onward requires supervisor approval. This request will be queued in
              Reprint Requests until approved.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Details (optional)</Label>
            <Input value={details} onChange={e => setDetails(e.target.value)} placeholder="e.g. ribbon misaligned, label torn" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">{needsApproval ? "Requested by" : "Approver (optional)"}</Label>
            <Input value={approver} onChange={e => setApprover(e.target.value)} placeholder="Name" />
          </div>

          {needsApproval && overrideAllowed && (
            <div className="flex items-center justify-between rounded-xl border bg-surface px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Supervisor override</p>
                <p className="text-[11px] text-muted-foreground">Approve and print immediately. Logged as override.</p>
              </div>
              <Switch checked={override} onCheckedChange={setOverride} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy} className="bg-gradient-primary text-primary-foreground">
            {busy ? "Working…"
              : needsApproval && !(override && overrideAllowed)
                ? "Queue for approval"
                : `Reprint with ${DUPLICATE_WATERMARK}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function packForRow(parsed: { category: string; details?: string; approver?: string }, override: boolean) {
  const DELIM = " ‖ ";
  const parts = [parsed.category];
  if (parsed.details) parts.push(`details=${parsed.details}`);
  if (parsed.approver) parts.push(`approver=${parsed.approver}`);
  if (override) parts.push(`override=true`);
  return parts.join(DELIM);
}
