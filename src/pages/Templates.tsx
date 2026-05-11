import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { PRESET_SIZES } from "@/lib/labelSizes";
import { Barcode } from "@/components/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { generateTSPL, generateZPL } from "@/lib/printerCommands";
import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";

export default function Templates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [sizeId, setSizeId] = useState("75x50");
  const [showQr, setShowQr] = useState(false);
  const [showSku, setShowSku] = useState(true);
  const [showWeight, setShowWeight] = useState(true);
  const [scale, setScale] = useState([1]);

  useEffect(() => { (async () => {
    const t = await listTable<any>("ols_label_templates");
    setTemplates(t); setActive(t[0] || null);
  })(); }, []);

  const size = PRESET_SIZES.find(s => s.id === sizeId)!;
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
                <button onClick={() => { setActive(t); setSizeId(`${t.width_mm}x${t.height_mm}`); setShowQr(!!t.show_qr); }}
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
                  <button key={s.id} onClick={() => setSizeId(s.id)} className={`rounded-md border px-2 py-1 text-xs ${sizeId === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-surface"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Show QR" checked={showQr} onChange={setShowQr} />
            <Toggle label="Show SKU" checked={showSku} onChange={setShowSku} />
            <Toggle label="Show weight" checked={showWeight} onChange={setShowWeight} />
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Font scale</span><span className="font-mono">{scale[0].toFixed(1)}×</span></div>
              <Slider value={scale} onValueChange={setScale} min={0.6} max={1.6} step={0.1} />
            </div>
          </div>
        </div>

        <div className="ols-card p-5 lg:col-span-3">
          <h3 className="mb-3 text-sm font-semibold">Live preview</h3>
          <div className="flex justify-center">
            <div
              className="rounded-md border bg-white p-3 shadow-soft"
              style={{ width: `${size.w * 3}px`, minHeight: `${size.h * 3}px`, transform: `scale(${scale[0]})`, transformOrigin: "center top" }}
            >
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{size.label}</p>
              <p className="mt-1 text-sm font-semibold leading-tight">{payload.title}</p>
              <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                {payload.lines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
              <div className="mt-2 flex items-end justify-between">
                <Barcode value={payload.barcode} height={36} />
                {showQr && <div className="ml-2"><QRCodeSVG value={payload.qr!} size={48} /></div>}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <CmdCard title="TSPL" code={generateTSPL(payload)} onCopy={copy} />
            <CmdCard title="ZPL" code={generateZPL(payload)} onCopy={copy} />
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => window.print()}><Printer size={16} className="mr-1.5" /> Browser Print</Button>
            <Button variant="outline">Save as new template</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between"><span className="text-xs">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
function CmdCard({ title, code, onCopy }: { title: string; code: string; onCopy: (s: string) => void }) {
  return (
    <div className="rounded-xl border bg-surface">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">{title}</span>
        <Button size="sm" variant="ghost" onClick={() => onCopy(code)}><Copy size={14} className="mr-1" /> Copy</Button>
      </div>
      <pre className="max-h-44 overflow-auto p-3 text-[10px] leading-snug text-muted-foreground">{code}</pre>
    </div>
  );
}
