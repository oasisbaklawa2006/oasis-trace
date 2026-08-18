import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable, insertRow } from "@/lib/data";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRESET_SIZES } from "@/lib/labelSizes";
import { LabelPreview } from "@/components/LabelPreview";
import { generateTSPL, generateZPL, type Rotation, type PrinterProfile } from "@/lib/printerCommands";
import { sendToPrintBridge, connectionIsConfigured, type PrinterConnection } from "@/lib/printBridge";
import { Copy, Printer, RotateCw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import type { LabelTemplateRow, PrinterRow } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export default function Templates() {
  const [templates, setTemplates] = useState<LabelTemplateRow[]>([]);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [printerId, setPrinterId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState<LabelTemplateRow | null>(null);
  const [sizeId, setSizeId] = useState("75x50");
  const [showQr, setShowQr] = useState(false);
  const [showSku, setShowSku] = useState(true);
  const [showWeight, setShowWeight] = useState(true);
  const [scale, setScale] = useState([1]);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [showGrid, setShowGrid] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const t = await listTable<LabelTemplateRow>("ols_label_templates");
    setTemplates(t);
    return t;
  }

  function applyTemplate(t: LabelTemplateRow) {
    setActive(t);
    setSizeId(`${t.width_mm}x${t.height_mm}`);
    setShowQr(!!t.show_qr);
    setScale([t.font_scale ?? 1]);
    const fields = t.fields as { showSku?: boolean; showWeight?: boolean; showGrid?: boolean; rotation?: Rotation } | undefined;
    setShowSku(fields?.showSku ?? true);
    setShowWeight(fields?.showWeight ?? true);
    setShowGrid(fields?.showGrid ?? false);
    setRotation(fields?.rotation ?? 0);
  }

  useEffect(() => { (async () => {
    const t = await reload();
    if (t[0]) applyTemplate(t[0]);
  })(); }, []);

  useEffect(() => { (async () => {
    const rows = await listTable<PrinterRow>("ols_printers");
    setPrinters(rows);
    if (rows[0]) setPrinterId(rows[0].id);
  })(); }, []);

  const selectedPrinter = printers.find(p => p.id === printerId) ?? null;
  const selectedConnection = (selectedPrinter?.settings as PrinterConnection | undefined) ?? {};
  const canSendToPrinter = connectionIsConfigured(selectedConnection);

  async function sendToSelectedPrinter(cmd: string) {
    if (!selectedPrinter || !connectionIsConfigured(selectedConnection)) return;
    setSending(true);
    const result = await sendToPrintBridge(selectedConnection, cmd);
    setSending(false);
    if (result.ok) toast.success("Sent to printer", { description: result.message });
    else toast.error("Send failed", { description: result.message });
  }

  const size = PRESET_SIZES.find(s => s.id === sizeId)!;

  async function saveAsNewTemplate() {
    const name = newName.trim();
    if (!name) { toast.error("Template name is required"); return; }
    setSaving(true);
    try {
      const saved = await insertRow<LabelTemplateRow>("ols_label_templates", {
        name,
        label_type: active?.label_type || "production",
        width_mm: size.w,
        height_mm: size.h,
        barcode_type: "CODE128",
        show_qr: showQr,
        font_scale: scale[0],
        fields: { showSku, showWeight, showGrid, rotation },
      });
      await reload();
      setActive(saved);
      setNewName("");
      toast.success(`Template "${saved.name}" saved`);
    } catch (e: unknown) {
      toast.error("Failed to save template", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  const payload = {
    widthMm: size.w, heightMm: size.h,
    title: "Cashew Pyramid Baklawa",
    lines: [...(showSku ? ["SKU CPB-5000  Batch BAT-…"] : []), ...(showWeight ? ["Net 5.00 kg  Gross 5.25 kg"] : [])],
    barcode: "PL-PREVIEW-0001",
    qr: showQr ? "QR-PREVIEW-001" : undefined,
  };

  function copy(text: string) { navigator.clipboard.writeText(text); toast.success("Copied"); }

  return (
    <div>
      <PageHeader eyebrow="Setup" title="Label Template Library" description="Preset sizes only — width ≤ 100 mm, length ≤ 150 mm. Drag/drop designer is phase 2." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="ols-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Templates</h3>
          <ul className="space-y-1.5">
            {templates.map(t => (
              <li key={t.id}>
                <button onClick={() => applyTemplate(t)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${active?.id === t.id ? "border-primary bg-primary/5" : "bg-surface"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.width_mm}×{t.height_mm}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground capitalize">{t.label_type}</p>
                </button>
              </li>
            ))}
          </ul>

          <h4 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Edit</h4>
          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Preset size</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_SIZES.map(s => (
                  <button key={s.id} onClick={() => setSizeId(s.id)} aria-pressed={sizeId === s.id} className={`rounded-md border px-2 py-1 text-xs ${sizeId === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-surface"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Show QR" checked={showQr} onChange={setShowQr} />
            <Toggle label="Show SKU" checked={showSku} onChange={setShowSku} />
            <Toggle label="Show weight" checked={showWeight} onChange={setShowWeight} />
            <Toggle label="Show grid" checked={showGrid} onChange={setShowGrid} />
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Font scale</span><span className="font-mono">{scale[0].toFixed(1)}×</span></div>
              <Slider value={scale} onValueChange={setScale} min={0.6} max={1.6} step={0.1} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Rotation</span><span className="font-mono">{rotation}°</span></div>
              <div className="flex gap-1">
                {[0, 90, 180, 270].map(r => (
                  <button key={r} onClick={() => setRotation(r as Rotation)} aria-pressed={rotation === r} className={`flex-1 rounded-md border px-2 py-1 text-xs ${rotation === r ? "border-primary bg-primary text-primary-foreground" : "bg-surface"}`}>
                    <RotateCw size={10} className="inline mr-1" />{r}°
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="ols-card p-5 lg:col-span-3">
          <h3 className="mb-3 text-sm font-semibold">Live preview · safe-area + barcode quiet zones</h3>
          <div className="flex justify-center py-4">
            <LabelPreview
              widthMm={size.w} heightMm={size.h}
              eyebrow={size.label}
              title={payload.title}
              lines={payload.lines}
              barcode={payload.barcode}
              qr={showQr ? payload.qr : undefined}
              rotation={rotation}
              scale={scale[0]}
              showGrid={showGrid}
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={printerId} onValueChange={setPrinterId}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Send to printer…" /></SelectTrigger>
              <SelectContent>{printers.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.command_lang})</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {canSendToPrinter ? "Bridge-connected — Send buttons go straight to the printer." : "No network target configured for this printer — set one up in Printer Management."}
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <CmdCard title="TSPL" code={generateTSPL(payload)} onCopy={copy} onSend={canSendToPrinter ? sendToSelectedPrinter : undefined} sending={sending} />
            <CmdCard title="ZPL" code={generateZPL(payload)} onCopy={copy} onSend={canSendToPrinter ? sendToSelectedPrinter : undefined} sending={sending} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => window.print()}><Printer size={16} className="mr-1.5" /> Browser Print</Button>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New template name…"
              className="h-9 w-48"
            />
            <Button variant="outline" onClick={saveAsNewTemplate} disabled={saving}>
              <Save size={16} className="mr-1.5" /> {saving ? "Saving…" : "Save as new template"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between"><span className="text-xs">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
function CmdCard({ title, code, onCopy, onSend, sending }: { title: string; code: string; onCopy: (s: string) => void; onSend?: (s: string) => void; sending?: boolean }) {
  return (
    <div className="rounded-xl border bg-surface">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">{title}</span>
        <div className="flex items-center gap-1">
          {onSend && (
            <Button size="sm" variant="ghost" onClick={() => onSend(code)} disabled={sending}>
              <Send size={14} className="mr-1" /> {sending ? "Sending…" : "Send"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onCopy(code)}><Copy size={14} className="mr-1" /> Copy</Button>
        </div>
      </div>
      <pre className="max-h-44 overflow-auto p-3 text-[10px] leading-snug text-muted-foreground">{code}</pre>
    </div>
  );
}
