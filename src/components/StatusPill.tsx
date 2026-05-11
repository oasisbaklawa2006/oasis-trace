import { cn } from "@/lib/utils";

const MAP: Record<string, string> = {
  active: "bg-success/15 text-success",
  draft: "bg-muted text-muted-foreground",
  packed: "bg-primary/10 text-primary",
  finance_received: "bg-accent/15 text-accent",
  invoiced: "bg-accent/20 text-accent-foreground",
  shipping_labelled: "bg-primary/15 text-primary",
  gate_cleared: "bg-success/15 text-success",
  dispatched: "bg-success/20 text-success",
  held: "bg-warning/20 text-warning-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  pending: "bg-warning/15 text-warning-foreground",
  green: "bg-success/15 text-success",
  red: "bg-destructive/15 text-destructive",
  online: "bg-success/15 text-success",
  offline: "bg-destructive/15 text-destructive",
  cleared: "bg-success/15 text-success",
};

export function StatusPill({ status }: { status?: string | null }) {
  const s = (status || "—").toString();
  return (
    <span className={cn("ols-chip", MAP[s] ?? "bg-secondary text-secondary-foreground")}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s.replace(/_/g, " ")}
    </span>
  );
}
