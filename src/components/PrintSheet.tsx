import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  /** Force a page break after this sheet when printing. */
  pageBreakAfter?: boolean;
}

/**
 * A4 print container. On screen it renders as a luxe card; in print it
 * collapses to clean A4 with consistent margins and respects page breaks.
 */
export function PrintSheet({ children, className, pageBreakAfter }: Props) {
  return (
    <section
      className={cn(
        "ols-card print-sheet bg-white p-8 print:rounded-none print:border-0 print:shadow-none",
        pageBreakAfter && "print:break-after-page",
        className
      )}
    >
      {children}
    </section>
  );
}
