/**
 * Point 99 — Trace device / surface embedding closure (Trace-owned).
 *
 * Single fail-closed contract for PC, mobile, handheld scanner, and TV surfaces.
 * Preserves Point 94 identity, Point 95 print governance, and Point 96 offline paths.
 * Physical PC/mobile/handheld/TV UAT remains downstream — software proves policy only.
 */

export const DEVICE_SURFACE_CONTRACT_VERSION = "1.0";

export const MOBILE_BREAKPOINT_PX = 768;
export const HANDHELD_MAX_WIDTH_PX = 1024;
export const FAST_SCAN_BREAKPOINT_PX = 640;

export type DeviceSurface = "pc" | "mobile" | "handheld" | "tv";
export type RouteAccessMode = "full" | "scan" | "read" | "blocked";

export type DeviceCapability =
  | "navigate"
  | "keyboard_wedge_scan"
  | "camera_scan"
  | "central_submit"
  | "offline_queue_view"
  | "print_command"
  | "reprint"
  | "admin_settings"
  | "production_write"
  | "finance_write"
  | "reports_export";

export interface TraceRouteSurfaceRow {
  route: string;
  label: string;
  group: string;
  deviceIntent: Record<DeviceSurface, RouteAccessMode>;
  primaryCapabilities: DeviceCapability[];
  responsiveNotes: string;
  embeddingBlockers: string[];
  sources: string[];
  tests: string[];
}

export interface RouteAccessResult {
  allowed: boolean;
  mode: RouteAccessMode;
  readOnly: boolean;
  guidance?: string;
}

export interface CapabilityCheckResult {
  allowed: boolean;
  guidance: string;
}

export const TRACE_ROUTE_SURFACE_CENSUS: TraceRouteSurfaceRow[] = [
  {
    route: "/",
    label: "Dashboard",
    group: "Overview",
    deviceIntent: { pc: "full", mobile: "read", handheld: "read", tv: "read" },
    primaryCapabilities: ["navigate", "offline_queue_view"],
    responsiveNotes: "2-col mobile grid; 30s auto-refresh on all surfaces",
    embeddingBlockers: [],
    sources: ["src/pages/Dashboard.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/printers",
    label: "Printers",
    group: "Setup",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["print_command", "admin_settings"],
    responsiveNotes: "Desktop setup surface — preset selects and bridge config",
    embeddingBlockers: ["Printer bridge config requires desktop ops station"],
    sources: ["src/pages/Printers.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/templates",
    label: "Label Templates",
    group: "Setup",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["print_command", "admin_settings"],
    responsiveNotes: "Template editor + preview — wide layout",
    embeddingBlockers: ["Label geometry editor not optimized for touch-only mobile"],
    sources: ["src/pages/Templates.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/production",
    label: "Production Entry",
    group: "Production",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["production_write", "print_command"],
    responsiveNotes: "Multi-select department/product form — lg:grid-cols-5",
    embeddingBlockers: ["Multi-field production form is desktop-first"],
    sources: ["src/pages/ProductionEntry.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/stock",
    label: "Stock Units",
    group: "Production",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["production_write"],
    responsiveNotes: "Inventory table management",
    embeddingBlockers: ["Bulk stock edits require desktop"],
    sources: ["src/pages/StockUnits.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/cartons",
    label: "Cartonization",
    group: "Dispatch",
    deviceIntent: { pc: "full", mobile: "scan", handheld: "scan", tv: "blocked" },
    primaryCapabilities: ["keyboard_wedge_scan", "central_submit", "print_command"],
    responsiveNotes: "ols-fast-scan at ≤640px; CTN-SO identity + label scan inputs",
    embeddingBlockers: ["Pack & Generate label is PC-only; scan flows usable on mobile/handheld"],
    sources: ["src/pages/Cartonization.tsx", "src/hooks/useScanLoop.ts"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/dpl",
    label: "DPL Documents",
    group: "Dispatch",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["production_write", "reports_export"],
    responsiveNotes: "Print-oriented DPL bundle — @media print styles",
    embeddingBlockers: ["DPL membership editing is desktop dispatch ops"],
    sources: ["src/pages/DPL.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/finance",
    label: "Finance PI Bridge",
    group: "Finance",
    deviceIntent: { pc: "full", mobile: "scan", handheld: "scan", tv: "blocked" },
    primaryCapabilities: ["keyboard_wedge_scan", "finance_write"],
    responsiveNotes: "PI carton scan input accepts keyboard-wedge Enter",
    embeddingBlockers: ["PI rollup approval tabs are desktop-first"],
    sources: ["src/pages/FinancePI.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/dispatch",
    label: "Dispatch Bundle",
    group: "Dispatch",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["reports_export", "print_command"],
    responsiveNotes: "A4 print bundle generation",
    embeddingBlockers: ["Dispatch bundle print is desktop ops"],
    sources: ["src/pages/DispatchBundle.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/shipping",
    label: "Shipping Labels",
    group: "Dispatch",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["print_command", "reprint"],
    responsiveNotes: "Governed print + ReprintModal",
    embeddingBlockers: ["Shipping label generation/reprint blocked on non-PC surfaces"],
    sources: ["src/pages/ShippingLabel.tsx", "src/lib/governedPrint.ts"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/gate",
    label: "Gate Scan",
    group: "Security",
    deviceIntent: { pc: "full", mobile: "scan", handheld: "scan", tv: "blocked" },
    primaryCapabilities: ["keyboard_wedge_scan", "central_submit", "offline_queue_view"],
    responsiveNotes: "ols-fast-scan at ≤640px; h-14 input; autofocus on mount; TV uses dedicated /tv/gate kiosk",
    embeddingBlockers: ["Generic Gate Scan contains mutation controls and is blocked on TV; use /tv/gate"],
    sources: ["src/pages/GateScan.tsx", "src/lib/scanSubmitQueue.ts"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/trace",
    label: "Traceability",
    group: "Operations",
    deviceIntent: { pc: "full", mobile: "read", handheld: "read", tv: "read" },
    primaryCapabilities: ["navigate"],
    responsiveNotes: "Search + chain view — touch-friendly result buttons",
    embeddingBlockers: [],
    sources: ["src/pages/Traceability.tsx", "src/lib/traceChain.ts"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/print-logs",
    label: "Print Logs",
    group: "Operations",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["reprint", "navigate"],
    responsiveNotes: "Interactive print-log/reprint table is PC-only; TV uses dedicated dispatch kiosk",
    embeddingBlockers: ["Generic Print Logs contains reprint controls and is blocked on TV; use /tv/dispatch"],
    sources: ["src/pages/PrintLogs.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/reprints",
    label: "Reprint Requests",
    group: "Operations",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["reprint", "admin_settings"],
    responsiveNotes: "Approval workflow — admin role gated",
    embeddingBlockers: ["Reprint approval must not appear on TV displays"],
    sources: ["src/pages/Reprints.tsx", "src/lib/reprintPolicy.ts"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/reports",
    label: "Reports",
    group: "Operations",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["reports_export"],
    responsiveNotes: "Lazy-loaded jspdf export — heavy desktop surface",
    embeddingBlockers: ["PDF export and multi-table scans are desktop-only"],
    sources: ["src/pages/Reports.tsx"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
  {
    route: "/settings",
    label: "Settings & Permissions",
    group: "Admin",
    deviceIntent: { pc: "full", mobile: "blocked", handheld: "blocked", tv: "blocked" },
    primaryCapabilities: ["admin_settings"],
    responsiveNotes: "Role/feedback/volume admin",
    embeddingBlockers: ["Admin controls must not appear on TV or floor scanners"],
    sources: ["src/pages/Settings.tsx", "src/lib/roles.ts"],
    tests: ["src/lib/deviceSurfaceContract.test.ts"],
  },
];

const TV_UA_RE = /SmartTV|Smart-TV|GoogleTV|AppleTV|Tizen|Web0S|WebOS|HbbTV|NetCast|BRAVIA|AFT[A-Z]|CrKey|TV Safari/i;
const HANDHELD_UA_RE = /Zebra|Honeywell|Datalogic|Intermec|Symbol|MC33|TC52|TC57|CK65|Scanner/i;

const PC_CAPABILITIES = new Set<DeviceCapability>([
  "navigate", "keyboard_wedge_scan", "camera_scan", "central_submit",
  "offline_queue_view", "print_command", "reprint", "admin_settings",
  "production_write", "finance_write", "reports_export",
]);
const MOBILE_CAPABILITIES = new Set<DeviceCapability>([
  "navigate", "keyboard_wedge_scan", "central_submit", "offline_queue_view",
]);
const HANDHELD_CAPABILITIES = new Set<DeviceCapability>([
  "navigate", "keyboard_wedge_scan", "central_submit", "offline_queue_view", "finance_write",
]);
const TV_CAPABILITIES = new Set<DeviceCapability>(["navigate", "offline_queue_view"]);

const MOBILE_GUIDANCE = new Map<DeviceCapability, string>([
  ["print_command", "Label print and template setup require a PC operations station."],
  ["reprint", "Reprint approval is available on PC only."],
  ["admin_settings", "Admin settings require a PC browser."],
  ["production_write", "Production entry is desktop-only."],
  ["finance_write", "Full finance PI approval is desktop-only; scan verification is available on /finance."],
  ["reports_export", "Report export requires a PC browser."],
  ["camera_scan", "Camera scanning is not implemented — use keyboard-wedge or manual entry."],
]);
const HANDHELD_GUIDANCE = new Map<DeviceCapability, string>([
  ["print_command", "Label generation requires a PC — use this device for scan verification only."],
  ["reprint", "Reprint controls are PC-only."],
  ["admin_settings", "Admin settings require a PC browser."],
  ["production_write", "Production entry is desktop-only."],
  ["reports_export", "Report export requires a PC browser."],
  ["camera_scan", "Camera scanning is not implemented — keyboard-wedge input is the approved path."],
]);
const TV_GUIDANCE = new Map<DeviceCapability, string>([
  ["keyboard_wedge_scan", "TV displays are read-only — use a PC or handheld scanner at the gate."],
  ["central_submit", "Central submit is disabled on TV — scan at a PC or handheld station."],
  ["print_command", "Print controls are hidden on TV displays."],
  ["reprint", "Reprint controls are hidden on TV displays."],
  ["admin_settings", "Admin settings are not available on TV displays."],
  ["production_write", "Production writes are not available on TV displays."],
  ["finance_write", "Finance writes are not available on TV displays."],
  ["reports_export", "Report export is not available on TV displays."],
  ["camera_scan", "Camera scanning is not available on TV displays."],
]);

export interface DeviceSurfaceDetectInput {
  widthPx: number;
  userAgent?: string;
  override?: string | null;
  coarsePointer?: boolean;
}

export function parseDeviceSurfaceOverride(raw: string | null | undefined): DeviceSurface | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "pc" || v === "desktop") return "pc";
  if (v === "mobile") return "mobile";
  if (v === "handheld" || v === "scanner") return "handheld";
  if (v === "tv" || v === "display") return "tv";
  return null;
}

export function detectDeviceSurface(input: DeviceSurfaceDetectInput): DeviceSurface {
  const override = parseDeviceSurfaceOverride(input.override ?? undefined);
  if (override) return override;
  const ua = input.userAgent ?? "";
  if (TV_UA_RE.test(ua)) return "tv";
  if (HANDHELD_UA_RE.test(ua)) return "handheld";
  if (input.widthPx < MOBILE_BREAKPOINT_PX) return "mobile";
  if (input.coarsePointer && input.widthPx <= HANDHELD_MAX_WIDTH_PX) return "handheld";
  return "pc";
}

export function censusRowForRoute(pathname: string): TraceRouteSurfaceRow | undefined {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return TRACE_ROUTE_SURFACE_CENSUS.find(row => row.route === path);
}

function routeModeForSurface(row: TraceRouteSurfaceRow, surface: DeviceSurface): RouteAccessMode {
  switch (surface) {
    case "pc": return row.deviceIntent.pc;
    case "mobile": return row.deviceIntent.mobile;
    case "handheld": return row.deviceIntent.handheld;
    case "tv": return row.deviceIntent.tv;
  }
}

function capabilitiesForSurface(surface: DeviceSurface): ReadonlySet<DeviceCapability> {
  switch (surface) {
    case "pc": return PC_CAPABILITIES;
    case "mobile": return MOBILE_CAPABILITIES;
    case "handheld": return HANDHELD_CAPABILITIES;
    case "tv": return TV_CAPABILITIES;
  }
}

function guidanceForSurface(surface: DeviceSurface, capability: DeviceCapability): string | undefined {
  switch (surface) {
    case "pc": return undefined;
    case "mobile": return MOBILE_GUIDANCE.get(capability);
    case "handheld": return HANDHELD_GUIDANCE.get(capability);
    case "tv": return TV_GUIDANCE.get(capability);
  }
}

export function routeAccessForSurface(pathname: string, surface: DeviceSurface): RouteAccessResult {
  const row = censusRowForRoute(pathname);
  if (!row) {
    return {
      allowed: true,
      mode: surface === "tv" ? "read" : "full",
      readOnly: surface === "tv",
    };
  }
  const mode = routeModeForSurface(row, surface);
  if (mode === "blocked") {
    return {
      allowed: false,
      mode,
      readOnly: true,
      guidance: blockedRouteGuidance(row.route, surface),
    };
  }
  return {
    allowed: true,
    mode,
    readOnly: mode === "read",
  };
}

export function blockedRouteGuidance(route: string, surface: DeviceSurface): string {
  const row = TRACE_ROUTE_SURFACE_CENSUS.find(candidate => candidate.route === route);
  const label = row?.label ?? route;
  switch (surface) {
    case "tv":
      if (route === "/gate") {
        return `${label} is not available on TV displays. Use the dedicated /tv/gate kiosk for read-only gate monitoring.`;
      }
      if (route === "/print-logs") {
        return `${label} is not available on TV displays. Use the dedicated /tv/dispatch kiosk for read-only dispatch monitoring.`;
      }
      return `${label} is not available on TV displays. Use Dashboard, Traceability, /tv/gate, or /tv/dispatch for read-only monitoring.`;
    case "mobile":
      return `${label} requires a PC operations station. Mobile devices can access scan-critical routes: Gate Scan, Cartonization, Finance PI, Dashboard, and Traceability.`;
    case "handheld":
      return `${label} requires a PC for write/print operations. Handheld scanners support Gate Scan, Cartonization scan flows, Finance PI scan, Dashboard, and Traceability.`;
    case "pc":
      return `${label} is not available on this surface.`;
  }
}

export function isCapabilityAllowed(surface: DeviceSurface, capability: DeviceCapability): CapabilityCheckResult {
  const allowed = capabilitiesForSurface(surface).has(capability);
  return {
    allowed,
    guidance: allowed
      ? ""
      : (guidanceForSurface(surface, capability) ?? `Capability "${capability}" is not supported on ${surface} surfaces.`),
  };
}

export function navRoutesForSurface(surface: DeviceSurface): TraceRouteSurfaceRow[] {
  return TRACE_ROUTE_SURFACE_CENSUS.filter(row => routeModeForSurface(row, surface) !== "blocked");
}

export function isFastScanLayout(widthPx: number): boolean {
  return widthPx <= FAST_SCAN_BREAKPOINT_PX;
}

export function surfaceDisplayLabel(surface: DeviceSurface): string {
  switch (surface) {
    case "pc": return "PC Operations";
    case "mobile": return "Mobile Scan";
    case "handheld": return "Handheld Scanner";
    case "tv": return "TV Display (read-only)";
  }
}
