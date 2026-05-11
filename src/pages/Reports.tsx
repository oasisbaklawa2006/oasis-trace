import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTable } from "@/lib/data";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";

export default function Reports() {
  const [labels, setLabels] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);

  useEffect(() => { (async () => {
    setLabels(await listTable("ols_production_labels"));
    setCartons(await listTable("ols_cartons"));
  })(); }, []);

  const byDept: Record<string, number> = {};
  labels.forEach(l => {
    const d = l.metadata?.department || "—";
    byDept[d] = (byDept[d] || 0) + 1;
  });
  const chart = Object.entries(byDept).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Reports" description="Production by department, packing throughput, gate flow." />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Production by department</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="ols-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Throughput</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total labels" value={labels.length} />
            <Stat label="Total cartons" value={cartons.length} />
            <Stat label="Packed cartons" value={cartons.filter(c => c.status !== "draft").length} />
            <Stat label="Dispatched" value={cartons.filter(c => c.status === "dispatched").length} />
          </div>
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value }: any) {
  return <div className="rounded-xl border bg-surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="ols-stat-num mt-1">{value}</p></div>;
}
