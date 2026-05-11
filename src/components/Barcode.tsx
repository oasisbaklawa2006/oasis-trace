import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { code128ModuleMm, QUIET_ZONE_MM } from "@/lib/labelGeometry";

interface Props {
  value: string;
  format?: "CODE128" | "EAN13";
  height?: number;          // pixels, on-screen
  displayValue?: boolean;
  className?: string;
  /** Optional available width in mm. When set, module width is auto-sized to fit
   *  with proper quiet zones — prevents thermal printer overflow. */
  availableWidthMm?: number;
}

export function Barcode({
  value,
  format = "CODE128",
  height = 56,
  displayValue = true,
  className,
  availableWidthMm,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      const v = value || " ";
      let widthOpt = 1.6;
      let marginOpt = 4;
      if (availableWidthMm && format === "CODE128") {
        const moduleMm = code128ModuleMm(v.length, availableWidthMm);
        // Convert mm module width → on-screen px (≈3.78 px/mm at 96 DPI)
        widthOpt = Math.max(1, +(moduleMm * 3.78).toFixed(2));
        marginOpt = Math.round(QUIET_ZONE_MM.CODE128 * 3.78);
      }
      JsBarcode(ref.current, v, {
        format,
        height,
        displayValue,
        fontSize: 12,
        width: widthOpt,
        margin: marginOpt,
        background: "transparent",
      });
    } catch {
      /* ignore invalid */
    }
  }, [value, format, height, displayValue, availableWidthMm]);
  return <svg ref={ref} className={className} />;
}
