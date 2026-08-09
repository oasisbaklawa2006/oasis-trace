import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable, updateRow } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { Printer, Wrench, Save } from "lucide-react";
import { generateTSPL, generateZPL, testPrintPayload, type PrinterProfile } from "@/lib/printerCommands";
import { PRINTER_PRESETS, presetByKey } from "@/lib/printerPresets";
import { toast } from "sonner";
import type { PrinterRow } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export default function Printers() {
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [editing, setEditing] = useState<PrinterRow | null>(null);

  useEffect(() => { reload(); }, []);
  async function reload() { setPrinters(await listTable<PrinterRow>("ols_printers")); }

  return (
    <div>
      <PageHeader eyebrow="Setup" title="Printer Management" description="TSPL & ZPL command generation, calibration, presets for TSC TE244, Zebra GK420, XPrinter, generic TSPL/ZPL." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {printers.map(p => <PrinterCard key={p.id} printer={p} onEdit={() => setEditing(p)} />)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Local print bridge integration is reserved for the next phase — commands above are generated client-side and copied to clipboard.</p>
      {editing && (
        <CalibrationDrawer printer={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />
      )}
    </div>
  );
}

function PrinterCard({ printer, onEdit }: { printer: PrinterRow; onEdit: () => void }) {
  const profile: PrinterProfile = (printer.settings as PrinterProfile) || {};
  function testPrint() {
    const payload = testPrintPayload(profile);
    const cmd = printer.command_lang === "ZPL" ? generateZPL(payload) : generateTSPL(payload);
    try {
      navigator.clipboard.writeText(cmd);
      toast.success("Test print commands copied", { description: `${printer.command_lang} for ${printer.name}` });
    } catch { toast.error("Clipboard unavailable", { description: "Open browser print dialog instead." }); }
  }
  return (
    <div className="ols-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground"><Printer size={18} /></div>
          <div>
            <p className="text-sm font-semibold">{printer.name}</p>
            <p className="text-xs text-muted-foreground">{printer.model} · {printer.command_lang}</p>
          </div>
        </div>
        <StatusPill status={printer.status} />
      </div>
      <div className="mt-4 space-y-2 text-xs">
        <Stat row="Darkness" v={String(profile.darkness ?? "—")} />
        <Stat row="Speed" v={String(profile.speed ?? "—")} />
        <Stat row="Gap mm" v={String(profile.gapMm ?? 3)} />
        <Stat row="Black-mark mm" v={profile.blackMarkMm ? String(profile.blackMarkMm) : "—"} />
        <Stat row="DPI" v={String(profile.dpi ?? 203)} />
        <Stat row="Thermal Y mm" v={String(profile.thermalOffsetMm ?? 0)} />
        <Stat row="X offset mm" v={String(profile.xOffsetMm ?? 0)} />
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}><Wrench size={14} className="mr-1" /> Calibrate</Button>
        <Button size="sm" className="flex-1 bg-gradient-primary text-primary-foreground" onClick={testPrint}>Test Print</Button>
      </div>
    </div>
  );
}

function Stat({ row, v }: { row: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-surface px-2 py-1.5">
      <span className="text-muted-foreground">{row}</span><span className="font-mono">{v}</span>
    </div>
  );
}

function CalibrationDrawer({ printer, onClose, onSaved }: { printer: PrinterRow; onClose: () => void; onSaved: () => void }) {
  const initial: PrinterProfile = (printer.settings as PrinterProfile) || {};
  const [presetKey, setPresetKey] = useState<string>("");
  const [darkness, setDarkness] = useState([initial.darkness ?? 8]);
  const [speed, setSpeed] = useState([initial.speed ?? 4]);
  const [gap, setGap] = useState(String(initial.gapMm ?? 3));
  const [bm, setBm] = useState(String(initial.blackMarkMm ?? ""));
  const [dpi, setDpi] = useState(String(initial.dpi ?? 203));
  const [thermalY, setThermalY] = useState(String(initial.thermalOffsetMm ?? 0));
  const [xOff, setXOff] = useState(String(initial.xOffsetMm ?? 0));
  const [busy, setBusy] = useState(false);

  function applyPreset(k: string) {
    setPresetKey(k);
    const p = presetByKey(k); if (!p) return;
    setDarkness([p.darkness ?? 8]); setSpeed([p.speed ?? 4]);
    setGap(String(p.gapMm ?? 3)); setBm(p.blackMarkMm ? String(p.blackMarkMm) : "");
    setDpi(String(p.dpi ?? 203));
    setThermalY(String(p.thermalOffsetMm ?? 0)); setXOff(String(p.xOffsetMm ?? 0));
    toast.success(`Preset ${p.label} loaded`);
  }

  async function save() {
    setBusy(true);
    const profile: PrinterProfile & { presetKey?: string } = {
      darkness: darkness[0], speed: speed[0],
      gapMm: Number(gap) || 3,
      blackMarkMm: bm ? Number(bm) : undefined,
      dpi: (Number(dpi) === 300 ? 300 : 203),
      thermalOffsetMm: Number(thermalY) || 0,
      xOffsetMm: Number(xOff) || 0,
      presetKey: presetKey || undefined,
    };
    try {
      await updateRow("ols_printers", printer.id, { settings: profile });
      toast.success("Printer profile saved"); onSaved();
    } catch (e: unknown) { toast.error("Save failed", { description: errorMessage(e) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-elevated" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Calibrate · {printer.name}</h2>
        <p className="text-xs text-muted-foreground">{printer.model} · {printer.command_lang}</p>

        <div className="mt-5 space-y-5">
          <div>
            <Label className="mb-1.5 block text-xs">Preset</Label>
            <Select value={presetKey} onValueChange={applyPreset}>
              <SelectTrigger><SelectValue placeholder="Pick a printer preset" /></SelectTrigger>
              <SelectContent>{PRINTER_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Darkness</span><span className="font-mono">{darkness[0]}</span></div>
            <Slider value={darkness} onValueChange={setDarkness} min={0} max={15} step={1} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Speed (in/s)</span><span className="font-mono">{speed[0]}</span></div>
            <Slider value={speed} onValueChange={setSpeed} min={1} max={10} step={1} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="mb-1.5 block text-xs">Label gap (mm)</Label><Input value={gap} onChange={e => setGap(e.target.value)} type="number" step="0.5" min={0} /></div>
            <div><Label className="mb-1.5 block text-xs">Black-mark offset (mm)</Label><Input value={bm} onChange={e => setBm(e.target.value)} type="number" step="0.5" min={0} placeholder="optional" /></div>
            <div><Label className="mb-1.5 block text-xs">DPI</Label><Input value={dpi} onChange={e => setDpi(e.target.value)} type="number" /></div>
            <div><Label className="mb-1.5 block text-xs">Thermal Y comp (mm)</Label><Input value={thermalY} onChange={e => setThermalY(e.target.value)} type="number" step="0.1" /></div>
            <div><Label className="mb-1.5 block text-xs">X offset (mm)</Label><Input value={xOff} onChange={e => setXOff(e.target.value)} type="number" step="0.1" /></div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={save} disabled={busy} className="flex-1 bg-gradient-primary text-primary-foreground">
            <Save size={14} className="mr-1" /> {busy ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </div>
    </div>
  );
}
