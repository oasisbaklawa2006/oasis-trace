import { ReactNode, useMemo } from "react";
import { Barcode } from "@/components/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { mmToPx, qrTooDense, recommendedQrSizeMm, SAFE_AREA_MM, QUIET_ZONE_MM } from "@/lib/labelGeometry";
import { cn } from "@/lib/utils";
import type { Rotation } from "@/lib/printerCommands";
import { AlertTriangle } from "lucide-react";

export interface LabelPreviewProps {
  widthMm: number;
  heightMm: number;
  title?: string;
  lines?: string[];
  barcode?: string;
  qr?: string;
  /** Optional eyebrow text (size hint, e.g. "75 × 50 mm"). */
  eyebrow?: string;
  rotation?: Rotation;
  scale?: number;
  showSafeArea?: boolean;
  showGrid?: boolean;
  watermark?: string;
  /** Reprint counter shown as a small badge in the corner. */
  reprintCount?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Single shared label preview surface. Handles mm-to-pixel calibration,
 * safe-area visualization, optional 5mm grid, rotation, watermark, barcode
 * and QR sizing. Used by Production / Carton / Shipping / Templates.
 */
export function LabelPreview({
  widthMm, heightMm,
  title, lines = [], barcode, qr,
  eyebrow,
  rotation = 0, scale = 1,
  showSafeArea = true, showGrid = false,
  watermark, reprintCount,
  className, children,
}: LabelPreviewProps) {
  const wPx = mmToPx(widthMm, scale * 2);
  const hPx = mmToPx(heightMm, scale * 2);
  const insetPx = mmToPx(SAFE_AREA_MM, scale * 2);
  const qrSizeMm = qr ? recommendedQrSizeMm(widthMm, heightMm) : 0;
  const qrPx = mmToPx(qrSizeMm, scale * 2);

  const gridLines = useMemo(() => {
    if (!showGrid) return null;
    const stepMm = 5;
    const cols = Math.floor(widthMm / stepMm);
    const rows = Math.floor(heightMm / stepMm);
    const out: ReactNode[] = [];
    for (let i = 1; i < cols; i++) {
      out.push(<div key={`v${i}`} className="absolute top-0 bottom-0 border-l border-primary/10" style={{ left: mmToPx(i * stepMm, scale * 2) }} />);
    }
    for (let i = 1; i < rows; i++) {
      out.push(<div key={`h${i}`} className="absolute left-0 right-0 border-t border-primary/10" style={{ top: mmToPx(i * stepMm, scale * 2) }} />);
    }
    return out;
  }, [showGrid, widthMm, heightMm, scale]);

  return (
    <div className={cn("inline-block", className)} style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "center center" }}>
      <div
        className="relative overflow-hidden rounded-md border bg-white text-foreground shadow-soft"
        style={{ width: wPx, height: hPx }}
      >
        {gridLines}
        {showSafeArea && (
          <div
            className="pointer-events-none absolute rounded-sm border border-dashed border-primary/30"
            style={{ left: insetPx, top: insetPx, right: insetPx, bottom: insetPx }}
          />
        )}
        <div className="relative h-full w-full p-2.5" style={{ padding: insetPx }}>
          {eyebrow && <p className="text-[8px] uppercase tracking-widest text-muted-foreground">{eyebrow}</p>}
          {title && <p className="mt-0.5 text-[11px] font-semibold leading-tight line-clamp-2">{title}</p>}
          {lines.length > 0 && (
            <div className="mt-0.5 space-y-0.5 text-[9px] leading-snug text-muted-foreground">
              {lines.map((l, i) => <div key={i} className="truncate">{l}</div>)}
            </div>
          )}
          <div className="absolute left-0 right-0 flex items-end justify-between gap-2 px-2.5" style={{ bottom: insetPx, paddingLeft: insetPx, paddingRight: insetPx }}>
            {barcode && (
              <div className="flex-1 min-w-0">
                <Barcode value={barcode} availableWidthMm={widthMm - SAFE_AREA_MM * 2 - (qr ? qrSizeMm + 2 : 0)} height={Math.min(44, hPx * 0.32)} />
              </div>
            )}
            {qr && (
              <div className="bg-white p-0.5">
                <QRCodeSVG value={qr} size={qrPx} level="M" />
              </div>
            )}
          </div>
          {children}
        </div>
        {watermark && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-22deg] select-none text-[28px] font-bold uppercase tracking-widest text-destructive/35">
              {watermark}
            </span>
          </div>
        )}
        {reprintCount && reprintCount > 0 && (
          <div className="absolute right-1 top-1 rounded-full bg-warning px-1.5 py-0.5 text-[9px] font-semibold text-warning-foreground">
            ×{reprintCount}
          </div>
        )}
      </div>
    </div>
  );
}
