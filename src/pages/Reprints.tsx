import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";
import { RotateCcw, Check, X, ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  approveRequest, rejectRequest, parseReason, canApprove, getRole, setRole,
  type ReprintRow, type ReprintStatus, type Role,
} from "@/lib/reprintPolicy";
import { useOlsSession } from "@/hooks/useOlsSession";
import { supabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

export default function Reprints() {
  const [rows, setRows] = useState<ReprintRow[]>([]);
  const [tab, setTab] = useState<ReprintStatus | "all">("pending");
  const [decision, setDecision] = useState<{ row: ReprintRow; action: "approve" | "reject" } | null>(null);
  const [role, setRoleState] = useState<Role>(getRole());
  const { canApproveReprint: canApproveJwt } = useOlsSession();
  const userCanApprove = supabaseConfigured ? canApproveJwt : canApprove();

  async function reload() {
    setRows(await listTable<ReprintRow>("ols_reprint_requests", { order: "created_at" }));
  }
  useEffect(() => { reload(); }, []);

  const filtered = tab === "all" ? rows : rows.filter(r => r.status === tab);
  const counts = {
    pending: rows.filter(r => r.status === "pending").length,
    approved: rows.filter(r => r.status === "approved").length,
    rejected: rows.filter(r => r.status === "rejected").length,
    all: rows.length,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Reprint Requests"
        description="Reprints from the 2nd attempt onward require supervisor approval. All decisions are audit-logged."
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Active role for approvals (local stub):</p>
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={(v) => { setRole(v as Role); setRoleState(v as Role); }}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="operator">Operator</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          {userCanApprove && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"><ShieldCheck size={10} /> Can approve</span>}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReprintStatus | "all")}>
        <TabsList>
          <TabsTrigger value="pending">Pending · {counts.pending}</TabsTrigger>
          <TabsTrigger value="approved">Approved · {counts.approved}</TabsTrigger>
          <TabsTrigger value="rejected">Rejected · {counts.rejected}</TabsTrigger>
          <TabsTrigger value="all">All · {counts.all}</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <div className="ols-card p-5">
            {filtered.length === 0 ? (
              <EmptyState icon={<RotateCcw />} title="No requests" description="Requests appear here as operators raise reprints." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Ref</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Approver</th>
                      <th className="px-3 py-2">Override</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const p = parseReason(r.reason);
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 capitalize">{r.ref_type}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.ref_id?.slice(0, 8)}</td>
                          <td className="px-3 py-2 text-xs">{p.category}{p.details ? <span className="text-muted-foreground"> — {p.details}</span> : null}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{p.approver || "—"}</td>
                          <td className="px-3 py-2 text-xs">{p.override ? <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning-foreground">override</span> : "—"}</td>
                          <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                          <td className="px-3 py-2 text-right">
                            {r.status === "pending" && userCanApprove ? (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => setDecision({ row: r, action: "approve" })}><Check size={14} className="mr-1" /> Approve</Button>
                                <Button size="sm" variant="ghost" onClick={() => setDecision({ row: r, action: "reject" })}><X size={14} className="mr-1" /> Reject</Button>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {decision && (
        <DecisionDialog
          row={decision.row}
          action={decision.action}
          onClose={() => setDecision(null)}
          onDone={async () => { setDecision(null); await reload(); }}
        />
      )}
    </div>
  );
}

function DecisionDialog({ row, action, onClose, onDone }: {
  row: ReprintRow; action: "approve" | "reject"; onClose: () => void; onDone: () => void;
}) {
  const [approver, setApprover] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!approver.trim()) { toast.error("Approver name is required"); return; }
    setBusy(true);
    try {
      if (action === "approve") await approveRequest(row, approver.trim(), remarks);
      else await rejectRequest(row, approver.trim(), remarks);
      toast.success(`Request ${action === "approve" ? "approved" : "rejected"}`);
      onDone();
    } catch (e: unknown) { toast.error("Failed", { description: errorMessage(e) }); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action === "approve" ? "Approve reprint" : "Reject reprint"}</DialogTitle>
          <DialogDescription>
            {action === "approve"
              ? `Confirm approval for ${row.ref_type} ${row.ref_id?.slice(0, 8)}. This is recorded in the audit log.`
              : `Confirm rejection for ${row.ref_type} ${row.ref_id?.slice(0, 8)}. This is recorded in the audit log.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="reprint-approver" className="mb-1.5 block text-xs">Approver name</Label>
            <Input id="reprint-approver" value={approver} onChange={e => setApprover(e.target.value)} placeholder="Supervisor name" />
          </div>
          <div>
            <Label htmlFor="reprint-remarks" className="mb-1.5 block text-xs">Remarks</Label>
            <Input id="reprint-remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={go} disabled={busy} className={action === "approve" ? "bg-gradient-primary text-primary-foreground" : ""} variant={action === "approve" ? "default" : "destructive"}>
            {busy ? "Saving…" : action === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
