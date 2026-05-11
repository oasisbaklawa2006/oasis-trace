// Lightweight exporters for audit reports — CSV download, A4 print via the
// browser print dialog, and PDF via jsPDF + autoTable.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReportColumn { key: string; header: string; width?: number; }
export interface Report {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  meta?: Record<string, any>;
}

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(report: Report): string {
  const header = report.columns.map(c => csvEscape(c.header)).join(",");
  const lines = report.rows.map(r => report.columns.map(c => csvEscape(r[c.key])).join(","));
  return [header, ...lines].join("\n");
}

export function downloadCSV(report: Report, filename?: string) {
  const csv = toCSV(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename || `${slug(report.title)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function exportPDF(report: Report, filename?: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(report.title, 14, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (report.subtitle) doc.text(report.subtitle, 14, 20);
  doc.text(`Generated ${report.generatedAt || new Date().toLocaleString()}`, 14, 25);
  autoTable(doc, {
    startY: 30,
    head: [report.columns.map(c => c.header)],
    body: report.rows.map(r => report.columns.map(c => fmt(r[c.key]))),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [25, 30, 45], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 246, 240] },
    margin: { left: 14, right: 14 },
  });
  doc.save(filename || `${slug(report.title)}.pdf`);
}

export function printA4() { window.print(); }

function fmt(v: any): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (v instanceof Date) return v.toLocaleString();
  return String(v);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
