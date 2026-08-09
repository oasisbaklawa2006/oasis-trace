// CSV download + A4 browser-print export. Deliberately has NO jsPDF
// dependency — it's imported eagerly by Traceability.tsx (not lazy-loaded),
// so pulling jsPDF/jspdf-autotable in here would put the ~200KB PDF library
// in the main bundle for a feature (PDF export) only Reports.tsx uses.
// See pdfExport.ts for the PDF path, which Reports.tsx lazy-loads.
export interface ReportColumn { key: string; header: string; width?: number; }
export type ReportCellValue = string | number | boolean | Date | null | undefined;
export interface Report {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCellValue>[];
  meta?: { truncated?: boolean; total?: number; cap?: number; [key: string]: unknown };
}

function csvEscape(v: ReportCellValue): string {
  if (v == null) return "";
  const s = String(v);
  // Prefix formula-triggering leading characters so spreadsheet software
  // (Excel, Google Sheets, LibreOffice) treats the cell as text, not a
  // formula — prevents CSV injection from any user-entered field that ends
  // up in an exported report.
  const safe = /^[\t\r ]*[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
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

export function printA4() { window.print(); }

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
