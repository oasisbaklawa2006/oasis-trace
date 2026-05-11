import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { StatusPill } from "@/components/StatusPill";
import { Printer, Wrench } from "lucide-react";

export default function Printers() {
  const [printers, setPrinters] = useState<any[]>([]);
  useEffect(() => { (async () => setPrinters(await listTable("ols_printers")))(); }, []);

  return (
    <div>
      <PageHeader eyebrow="Setup" title="Printer Management" description="TSC TE244 / TE200 / Zebra-compatible. TSPL & ZPL command generation, calibration, test print." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {printers.map(p => (
          <div key={p.id} className="ols-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground"><Printer size={18} /></div>
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.model} · {p.command_lang}</p>
                </div>
              </div>
              <StatusPill status={p.status} />
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <SettingRow label="Darkness" defaultVal={8} max={15} />
              <SettingRow label="Speed" defaultVal={4} max={10} />
              <div className="grid grid-cols-3 gap-2">
                <Stat label="W mm" v="100" /><Stat label="H mm" v="50" /><Stat label="Gap mm" v="3" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1"><Wrench size={14} className="mr-1" /> Calibrate</Button>
              <Button size="sm" className="flex-1 bg-gradient-primary text-primary-foreground">Test Print</Button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Local print bridge integration is reserved for the next phase — commands above are generated client-side and copied to clipboard.</p>
    </div>
  );
}

function SettingRow({ label, defaultVal, max }: { label: string; defaultVal: number; max: number }) {
  const [v, setV] = useState([defaultVal]);
  return (
    <div>
      <div className="mb-1 flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-mono">{v[0]}</span></div>
      <Slider value={v} onValueChange={setV} min={0} max={max} step={1} />
    </div>
  );
}
function Stat({ label, v }: { label: string; v: string }) {
  return <div className="rounded-lg border bg-surface px-2 py-1.5 text-center"><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-mono">{v}</p></div>;
}
