import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  title?: string;
  payload: object | null;
  idempotencyKey?: string;
  readyForCentral: boolean;
  userMessage?: string;
}

export function CentralPayloadPreview({
  title = "Central scan payload (preview only)",
  payload,
  idempotencyKey,
  readyForCentral,
  userMessage,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!payload && !idempotencyKey) return null;

  const json = payload ? JSON.stringify(payload, null, 2) : "";

  async function copyJson() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success("Payload JSON copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="mt-4 rounded-xl border bg-muted/30 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {readyForCentral ? (
          <Badge className="bg-success/15 text-success hover:bg-success/20">Ready for Central sync</Badge>
        ) : (
          <Badge variant="secondary">Not ready for Central sync</Badge>
        )}
      </div>
      {userMessage && <p className="mb-2 text-xs text-muted-foreground">{userMessage}</p>}
      {idempotencyKey && (
        <p className="mb-2 break-all font-mono text-[11px] text-muted-foreground">
          Idempotency key: <span className="text-foreground">{idempotencyKey}</span>
        </p>
      )}
      {json && (
        <>
          <pre className="max-h-56 overflow-auto rounded-lg border bg-background p-3 text-[11px] leading-relaxed">
            {json}
          </pre>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={copyJson}>
            {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
            Copy JSON
          </Button>
        </>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Preview only — no data is sent to Oasis Central in this sprint.
      </p>
    </div>
  );
}
