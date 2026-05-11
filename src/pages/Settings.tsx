import { PageHeader } from "@/components/PageHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/supabase";
import { demo } from "@/lib/demoStore";
import { toast } from "sonner";

const ROLES = ["super_admin", "qa", "hod", "store", "packing", "dispatch", "finance", "gate", "catalogue"];
const MODULES = ["dashboard", "production_entry", "stock_units", "cartonization", "dpl", "finance_pi", "shipping", "gate_scan", "templates", "printers", "reports"];

export default function Settings() {
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Settings & Permissions" description="Roles × modules. Checkbox-driven permissions matrix (MVP)." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="ols-card p-5 lg:col-span-2 overflow-x-auto">
          <h3 className="mb-3 text-sm font-semibold">Permissions matrix</h3>
          <table className="min-w-full text-sm">
            <thead><tr><th className="px-2 py-2 text-left text-xs uppercase tracking-wider text-muted-foreground">Module</th>{ROLES.map(r => <th key={r} className="px-2 py-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground">{r.replace("_", " ")}</th>)}</tr></thead>
            <tbody>
              {MODULES.map(m => (
                <tr key={m} className="border-t">
                  <td className="px-2 py-2 font-medium capitalize">{m.replace(/_/g, " ")}</td>
                  {ROLES.map(r => (
                    <td key={r} className="px-2 py-2 text-center">
                      <Checkbox defaultChecked={r === "super_admin" || (m === "production_entry" && (r === "hod" || r === "qa")) || (m === "cartonization" && r === "packing") || (m === "finance_pi" && r === "finance") || (m === "gate_scan" && r === "gate")} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="mt-4 bg-gradient-primary text-primary-foreground" onClick={() => toast.success("Permissions saved (placeholder)")}>Save Permissions</Button>
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
        </div>
      </div>
    </div>
  );
}
