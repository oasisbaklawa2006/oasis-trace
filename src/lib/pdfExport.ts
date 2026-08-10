// PDF export via jsPDF + autoTable. Kept separate from csvExport.ts so this
// ~200KB dependency only loads for Reports.tsx (already lazy-loaded in
// App.tsx), not for every route that just needs CSV/print export.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Report, ReportCellValue } from "@/lib/csvExport";
import { slug } from "@/lib/csvExport";

export type Watermark = "INTERNAL" | "VERIFIED" | "DRAFT" | "DUPLICATE COPY" | (string & {});

function fmt(v: ReportCellValue): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (v instanceof Date) return v.toLocaleString();
  return String(v);
}

export function exportPDF(report: Report, opts?: { filename?: string; watermark?: Watermark }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(report.title, 14, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (report.subtitle) doc.text(report.subtitle, 14, 20);
  doc.text(`Generated ${report.generatedAt || new Date().toLocaleString()}`, 14, 25);
  if (report.meta?.truncated) {
    doc.setTextColor(180, 0, 0);
    doc.text(`Truncated to ${report.meta.cap} of ${report.meta.total} rows. Narrow filters.`, 14, 30);
    doc.setTextColor(0, 0, 0);
  }
  autoTable(doc, {
    startY: report.meta?.truncated ? 34 : 30,
    head: [report.columns.map(c => c.header)],
    body: report.rows.map(r => report.columns.map(c => fmt(r[c.key]))),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [25, 30, 45], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 246, 240] },
    margin: { left: 14, right: 14, top: 14, bottom: 18 },
    didDrawPage: (data) => {
      if (opts?.watermark) {
        const w = doc.internal.pageSize.getWidth();
        const h = doc.internal.pageSize.getHeight();
        doc.setTextColor(220, 200, 180);
        doc.setFontSize(70);
        doc.setFont("helvetica", "bold");
        // jsPDF's TextOptionsLight type omits `angle`, which the runtime supports.
        doc.text(opts.watermark, w / 2, h / 2, { align: "center", angle: -22 } as Parameters<typeof doc.text>[3]);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
      }
      // jsPDF's public .d.ts omits getNumberOfPages() on `internal`, though it exists at runtime.
      const internal = doc.internal as typeof doc.internal & { getNumberOfPages?: () => number };
      const pageCount = internal.getNumberOfPages?.() || 1;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `${report.title} · Page ${data.pageNumber} of ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" }
      );
      doc.setTextColor(0, 0, 0);
    },
  });
  doc.save(opts?.filename || `${slug(report.title)}.pdf`);
}
