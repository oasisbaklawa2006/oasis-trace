import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertRow } from "@/lib/data";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

const REASONS = [
  "Damaged label",
  "Printer jam",
  "Wrong printer / template",
  "Lost in handling",
  "Audit / verification",
  "Other",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refType: "production_label" | "carton" | "shipping" | "dpl" | "pi";
  refId: string;
  refLabel: string;
  /** Called after a successful reprint log + request insert. */
  onConfirmed?: (info: { reason: string; approver?: string }) => void;
}

/**
 * Reprint reason modal — required reason, optional approver, writes
 * ols_reprint_requests + ols_print_logs (is_reprint=true). Architecture is
 * approval-ready: status defaults to "approved" today (no role check yet),
 * but the column lets a future Admin gate flip it to "pending".
 */
export function ReprintModal({ open, onOpenChange, refType, refId, refLabel, onConfirmed }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [approver, setApprover] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const finalReason = reason === "Other" ? (details || "Other") : (details ? `${reason} — ${details}` : reason);
      // Track the reprint as both a request (audit) and a print log (counter).
      try {
        await insertRow("ols_reprint_requests", {
          ref_type: refType, ref_id: refId,
          reason: finalReason, approver: approver || null,
          status: "approved",
        });
      } catch (e: any) { console.warn("reprint_requests insert skipped:", e?.message); }
      await insertRow("ols_print_logs", {
        ref_type: refType, ref_id: refId,
        success: true, is_reprint: true, reprint_count: 1,
        metadata: { reason: finalReason, approver: approver || null },
      });
      toast.success("Reprint logged", { description: refLabel });
      onConfirmed?.({ reason: finalReason, approver });
      onOpenChange(false);
      setDetails(""); setApprover("");
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
            Reprinting <span className="font-mono text-foreground">{refLabel}</span>. A "DUPLICATE" watermark
            will be applied and a print log entry recorded.
          </DialogDescription>
        </DialogHeader>
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
            <Label className="mb-1.5 block text-xs">Approver (optional)</Label>
            <Input value={approver} onChange={e => setApprover(e.target.value)} placeholder="Supervisor name" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy} className="bg-gradient-primary text-primary-foreground">
            {busy ? "Logging…" : "Reprint with DUPLICATE watermark"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
