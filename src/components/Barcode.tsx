import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { code128ModuleMm, MIN_MODULE_MM, MIN_QUIET_ZONE_MM, QUIET_ZONE_MM, wouldOverflow } from "@/lib/labelGeometry";
import { AlertTriangle } from "lucide-react";

interface Props {
  value: string;
  format?: "CODE128" | "EAN13";
  height?: number;          // pixels, on-screen
  displayValue?: boolean;
  className?: string;
  /** Optional available width in mm. When set, module width is auto-sized to fit
   *  with proper quiet zones — prevents thermal printer overflow. */
  availableWidthMm?: number;
  /** Optional callback when content overflows printable width. */
  onOverflow?: (info: { value: string; moduleMm: number }) => void;
}

export function Barcode({
  value,
  format = "CODE128",
  height = 56,
  displayValue = true,
  className,
  availableWidthMm,
  onOverflow,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      const v = value || " ";
      let widthOpt = 1.6;
      let marginOpt = 4;
      let moduleMmCalc = 0;
      if (availableWidthMm && format === "CODE128") {
        moduleMmCalc = code128ModuleMm(v.length, availableWidthMm);
        widthOpt = Math.max(1, +(moduleMmCalc * 3.78).toFixed(2));
        const quietMm = Math.max(MIN_QUIET_ZONE_MM, QUIET_ZONE_MM.CODE128);
        marginOpt = Math.round(quietMm * 3.78);
        const tooSmall = wouldOverflow(v.length, availableWidthMm, MIN_MODULE_MM);
        setOverflow(tooSmall);
        if (tooSmall) onOverflow?.({ value: v, moduleMm: moduleMmCalc });
      } else {
        setOverflow(false);
      }
      JsBarcode(ref.current, v, {
        format, height, displayValue, fontSize: 12,
        width: widthOpt, margin: marginOpt, background: "transparent",
      });
    } catch { /* ignore invalid */ }
  }, [value, format, height, displayValue, availableWidthMm, onOverflow]);

  return (
    <div className={className}>
      <svg ref={ref} />
      {overflow && (
        <p className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-destructive">
          <AlertTriangle size={10} /> Barcode too dense — widen label or shorten content.
        </p>
      )}
    </div>
  );
}
