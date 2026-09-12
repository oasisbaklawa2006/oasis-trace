import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertRow, updateRow } from "@/lib/data";
import { audit } from "@/lib/audit";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useOlsSession } from "@/hooks/useOlsSession";
import { supabaseConfigured } from "@/lib/supabase";
import {
  canOverride, createPendingRequest, getReprintCount, parseReason, requiresApproval,
  type ReprintRefType, type ReprintRow,
} from "@/lib/reprintPolicy";
import { findReusableApprovedRequestLive } from "@/lib/reprintApprovalLookup";
import { allocateGovernedReprint } from "@/lib/governedReprintAllocation";
import { errorMessage } from "@/lib/utils";

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
  /** Called only when Core authorizes execution; requestId is the replay/idempotency authority. */
  onConfirmed?: (info: {
    reason: string;
    approver?: string;
    watermark: string;
    reprintCount: number;
    requestId: string;
    actorId?: string;
    actorName?: string;
  }) => void | Promise<void>;
}

/**
 * Reprint reason modal.
 * Live mode delegates count allocation and approval threshold enforcement to Core.
 * Demo mode retains the historical local-only policy for non-authoritative previews.
 */
export function ReprintModal({ open, onOpenChange, refType, refId, refLabel, onConfirmed }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [approver, setApprover] = useState("");
  const [override, setOverride] = useState(false);
  const [priorCount, setPriorCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [requestRow, setRequestRow] = useState<ReprintRow | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason(REASONS[0]);
    setDetails("");
    setApprover("");
    setOverride(false);
    setRequestRow(null);
    getReprintCount(refType, refId).then(setPriorCount).catch(() => setPriorCount(0));
  }, [open, refType, refId]);

  const { session } = useOlsSession();
  const estimatedNeedsApproval = requiresApproval(priorCount);
  const demoOverrideAllowed = !supabaseConfigured && canOverride();

  async function confirmDemo(finalReason: string, parsed: { category: string; details?: string; approver?: string }) {
    const needsApproval = requiresApproval(priorCount);
    if (needsApproval && !(override && demoOverrideAllowed)) {
      await createPendingRequest({ refType, refId, refLabel, parsed });
      toast.warning("Reprint queued for supervisor approval", { description: refLabel });
      onOpenChange(false);
      return;
    }

    if (!onConfirmed) throw new Error("Governed reprint command handler is unavailable");

    let reqRow = requestRow;
    if (!reqRow) {
      reqRow = await insertRow<ReprintRow>("ols_reprint_requests", {
        ref_type: refType,
        ref_id: refId,
        reason: packForRow(parsed, override && demoOverrideAllowed),
        status: "pending",
      });
      setRequestRow(reqRow);
    }

    await onConfirmed({
      reason: finalReason,
      approver,
      watermark: DUPLICATE_WATERMARK,
      reprintCount: priorCount + 1,
      requestId: reqRow.id,
    });

    await updateRow("ols_reprint_requests", reqRow.id, { status: "approved" });
    await audit({
      action: override ? "reprint_override" : "reprint_immediate",
      entity_type: refType,
      entity_id: refId,
      details: { request_id: reqRow.id, reason: finalReason, approver, override, mode: "demo" },
    });
    toast.success("Reprint command generated", { description: refLabel });
    onOpenChange(false);
  }

  async function confirmLive(finalReason: string, parsed: { category: string; details?: string; approver?: string }) {
    if (!onConfirmed) throw new Error("Governed reprint command handler is unavailable");

    const actorId = session?.user?.id;
    const actorName = session?.user?.email ?? actorId;
    if (!actorId) throw new Error("Authenticated reprint actor is required in live mode");

    let reqRow = requestRow;
    if (!reqRow) {
      reqRow = await findReusableApprovedRequestLive(refType, refId);
      if (!reqRow) {
        reqRow = await insertRow<ReprintRow>("ols_reprint_requests", {
          ref_type: refType,
          ref_id: refId,
          reason: packForRow(parsed, false),
          status: "pending",
          requested_by: actorId,
        });
      }
      setRequestRow(reqRow);
    }

    const approvalRequestId = reqRow.status === "approved" ? reqRow.id : undefined;
    const persistedReason = parseReason(reqRow.reason).category;
    const effectiveReason = approvalRequestId ? persistedReason : finalReason;
    const allocation = await allocateGovernedReprint({
      refType,
      refId,
      reason: effectiveReason,
      requestId: reqRow.id,
      approvalRequestId,
    });

    if (allocation.approval_required && !allocation.allowed) {
      if (approvalRequestId) {
        throw new Error("Core did not recognize the persisted supervisor approval; reprint remains blocked");
      }
      const attached = await allocateGovernedReprint({
        refType,
        refId,
        reason: effectiveReason,
        requestId: reqRow.id,
        approvalRequestId: reqRow.id,
      });
      if (attached.allowed) {
        throw new Error("Core returned an unexpected approval state for a newly pending request");
      }
      await audit({
        action: "reprint_requested",
        entity_type: refType,
        entity_id: refId,
        details: {
          request_id: reqRow.id,
          reason: effectiveReason,
          actor_id: actorId,
          reprint_count: attached.reprint_count,
          approval_required: true,
        },
      });
      toast.warning("Reprint queued for supervisor approval", {
        description: `${refLabel} · governed count ${attached.reprint_count}`,
      });
      onOpenChange(false);
      return;
    }

    if (!allocation.allowed) {
      throw new Error("Core denied governed reprint execution");
    }

    await onConfirmed({
      reason: effectiveReason,
      approver,
      watermark: DUPLICATE_WATERMARK,
      reprintCount: allocation.reprint_count,
      requestId: reqRow.id,
      actorId,
      actorName,
    });

    await updateRow("ols_reprint_requests", reqRow.id, { status: "approved" });
    await audit({
      action: approvalRequestId ? "reprint_approved_execution" : "reprint_immediate",
      entity_type: refType,
      entity_id: refId,
      details: {
        request_id: reqRow.id,
        reason: effectiveReason,
        actor_id: actorId,
        reprint_count: allocation.reprint_count,
        allocation_id: allocation.allocation_id,
        approval_replayed: Boolean(approvalRequestId),
      },
    });
    toast.success("Reprint command generated", { description: refLabel });
    onOpenChange(false);
  }

  async function confirm() {
    setBusy(true);
    try {
      const finalReason = reason === "Other" ? (details || "Other") : reason;
      const parsed = { category: finalReason, details: details || undefined, approver: approver || undefined };
      if (supabaseConfigured) await confirmLive(finalReason, parsed);
      else await confirmDemo(finalReason, parsed);
    } catch (e: unknown) {
      toast.error("Reprint failed", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
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
            watermark will be applied. Prior reprints shown here: <strong>{priorCount}</strong>.
            {supabaseConfigured ? " Core re-validates the authoritative count when you submit." : ""}
          </DialogDescription>
        </DialogHeader>

        {estimatedNeedsApproval && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-warning-foreground">
              <ShieldCheck size={14} /> Approval likely required
            </div>
            <p className="mt-1 text-warning-foreground/80">
              Second reprint onward requires supervisor approval. In live mode Core makes the final decision atomically.
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
            <Label className="mb-1.5 block text-xs">Requested by / note (optional)</Label>
            <Input value={approver} onChange={e => setApprover(e.target.value)} placeholder="Name or note" />
          </div>

          {estimatedNeedsApproval && demoOverrideAllowed && (
            <div className="flex items-center justify-between rounded-xl border bg-surface px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Demo supervisor override</p>
                <p className="text-[11px] text-muted-foreground">Local preview only; live authority is enforced by Core.</p>
              </div>
              <Switch checked={override} onCheckedChange={setOverride} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy} className="bg-gradient-primary text-primary-foreground">
            {busy ? "Working…" : `Request ${DUPLICATE_WATERMARK}`}
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
