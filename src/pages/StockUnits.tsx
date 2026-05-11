import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { listTable } from "@/lib/data";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Boxes } from "lucide-react";

export default function StockUnits() {
  const [labels, setLabels] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { (async () => {
    setLabels(await listTable("ols_production_labels"));
    setStock(await listTable("ols_stock_units"));
  })(); }, []);

  const term = q.trim().toLowerCase();
  const filtered = labels.filter(l =>
    !term || l.label_no?.toLowerCase().includes(term) ||
    l.metadata?.product_name?.toLowerCase().includes(term) ||
    l.metadata?.sku?.toLowerCase().includes(term)
  );

  return (
    <div>
      <PageHeader eyebrow="Production" title="Stock Units & Movement" description="Every produced unit is a stock unit linked to its origin production label." />
      <div className="ols-card p-5">
        <Input placeholder="Search by label no, product, SKU…" value={q} onChange={e => setQ(e.target.value)} className="mb-4 max-w-md" />
        {filtered.length === 0 ? (
          <EmptyState icon={<Boxes />} title="No stock units" description="Generate production labels first." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Label #</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const s = stock.find(x => x.production_label_id === l.id);
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{l.label_no}</td>
                      <td className="px-3 py-2">{l.metadata?.product_name || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.metadata?.sku || "—"}</td>
                      <td className="px-3 py-2">{l.net_weight} kg</td>
                      <td className="px-3 py-2 capitalize">{s?.current_location || "—"}</td>
                      <td className="px-3 py-2"><StatusPill status={s?.current_status || l.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
