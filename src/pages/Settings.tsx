import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { supabaseConfigured } from "@/lib/supabase";
import { demo } from "@/lib/demoStore";
import { toast } from "sonner";
import {
  feedback, getVolume, setVolume,
  isMuted, setMuted,
  isFeedbackEnabled, setFeedbackEnabled,
} from "@/lib/scanFeedback";
import { Volume2, VolumeX, ShieldAlert } from "lucide-react";

export default function Settings() {
  const [vol, setVol] = useState(Math.round(getVolume() * 100));
  const [muted, setMutedState] = useState(isMuted());
  const [enabled, setEnabledState] = useState(isFeedbackEnabled());
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Settings & Permissions" description="Scan feedback and system info. Role-based access control is not managed here." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="ols-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Permissions</h3>
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">No frontend permissions editor here.</p>
              <p className="mt-1 opacity-90">
                Trace does not implement its own authorization model. Access is governed by each
                signed-in user's Supabase JWT role claims (<code className="font-mono">ols_roles</code>) and,
                where present, backend Row Level Security policy — both owned outside this app. A checkbox
                matrix here would not reflect or control real access, so none is shown. See the Trace
                forensic audit's RLS findings for the current state of role-scoped backend enforcement.
              </p>
            </div>
          </div>
        </div>

        <div className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">System</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-muted-foreground">Backend</span><span>{supabaseConfigured ? "Supabase (Oasis Central)" : "Local demo"}</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Schema prefix</span><code className="text-xs">ols_</code></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Migration file</span><code className="text-[10px]">supabase/migrations/20260511…</code></li>
          </ul>
          <div className="mt-4 space-y-2">
            <Button variant="outline" className="w-full" onClick={() => { demo.reset(); toast.success("Demo data reset"); setTimeout(() => location.reload(), 500); }}>Reset demo data</Button>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">All app data lives in tables prefixed <code>ols_</code>. Existing Oasis Central tables are never touched.</p>

          {/* Scan audio + haptics */}
          <div className="mt-5 rounded-xl border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Scan feedback</h4>
              <Button
                variant={muted ? "destructive" : "outline"} size="sm"
                onClick={() => { const next = !muted; setMuted(next); setMutedState(next); }}
                title="Emergency mute-all"
              >
                {muted ? <><VolumeX size={14} className="mr-1" /> Muted</> : <><Volume2 size={14} className="mr-1" /> On</>}
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Beeps + vibration</span>
              <Switch checked={enabled} onCheckedChange={(v) => { setFeedbackEnabled(v); setEnabledState(v); }} />
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Volume</span>
                <span className="font-mono">{vol}%</span>
              </div>
              <Slider value={[vol]} min={0} max={100} step={5}
                onValueChange={([v]) => { setVol(v); setVolume(v / 100); }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => feedback("ok")}>Test OK</Button>
              <Button size="sm" variant="outline" onClick={() => feedback("dup")}>Test Duplicate</Button>
              <Button size="sm" variant="outline" onClick={() => feedback("blocked")}>Test Blocked</Button>
              <Button size="sm" variant="outline" onClick={() => feedback("approval")}>Test Approval</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
