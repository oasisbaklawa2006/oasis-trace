import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface Props {
  value: string;
  format?: "CODE128" | "EAN13";
  height?: number;
  displayValue?: boolean;
  className?: string;
}

export function Barcode({ value, format = "CODE128", height = 56, displayValue = true, className }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value || " ", {
        format,
        height,
        displayValue,
        fontSize: 12,
        margin: 0,
        background: "transparent",
      });
    } catch {
      /* ignore invalid */
    }
  }, [value, format, height, displayValue]);
  return <svg ref={ref} className={className} />;
}
