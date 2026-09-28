/**
 * Governed Trace browser UAT evidence contract (UAT-0128..0131).
 * Read-only / non-mutation software surface checks only.
 * Browser emulation ≠ physical scanner certification (Leap13 / #462).
 */

import { censusRowForRoute } from "@/lib/deviceSurfaceContract";

export const TRACE_UAT_EVIDENCE_CONTRACT_VERSION = "1.0";

export const TRACE_UAT_PHYSICAL_SCANNER_DISCLAIMER =
  "Browser emulation and keyboard-wedge simulation are not physical scanner certification. "
  + "Handheld/wedge hardware UAT remains a separate human Leap13 gate.";

export type TraceUatEvidenceStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT-TESTED";

export type TraceUatDeviceEmulation = "pc" | "mobile" | "handheld";

export interface TraceUatScenarioDefinition {
  uatId: string;
  censusSlug: "scan-home" | "gate-scan" | "carton-scan" | "offline-queue";
  route: string;
  label: string;
  /** Registered App.tsx route validated against Point 99 census. */
  censusRoute: string;
  primaryCapabilities: string[];
  /** Harness must not perform these browser actions during evidence capture. */
  forbiddenActions: string[];
}

export const TRACE_UAT_SCENARIOS: readonly TraceUatScenarioDefinition[] = [
  {
    uatId: "UAT-0128",
    censusSlug: "scan-home",
    route: "/",
    label: "Scan home (Control Tower software surface)",
    censusRoute: "/",
    primaryCapabilities: ["navigate", "offline_queue_view"],
    forbiddenActions: ["central_submit", "production_write", "keyboard_wedge_scan_submit"],
  },
  {
    uatId: "UAT-0129",
    censusSlug: "gate-scan",
    route: "/gate",
    label: "Gate scan UI validation (synthetic, non-persisting)",
    censusRoute: "/gate",
    primaryCapabilities: ["keyboard_wedge_scan", "offline_queue_view"],
    forbiddenActions: ["central_submit", "legacy_gate_dispatch_mutation", "shipping_qr_submit"],
  },
  {
    uatId: "UAT-0130",
    censusSlug: "carton-scan",
    route: "/cartons",
    label: "Carton scan UI validation (no carton lifecycle mutations)",
    censusRoute: "/cartons",
    primaryCapabilities: ["keyboard_wedge_scan"],
    forbiddenActions: ["start_carton", "pack_label", "seal_carton", "central_submit"],
  },
  {
    uatId: "UAT-0131",
    censusSlug: "offline-queue",
    route: "/gate",
    label: "Offline queue banner (browser network state only)",
    censusRoute: "/gate",
    primaryCapabilities: ["offline_queue_view", "keyboard_wedge_scan"],
    forbiddenActions: ["central_submit", "offline_queue_replay", "production_write"],
  },
] as const;

/** Synthetic gate barcode: valid CTN-SO shape, non-existent order — no scan history write. */
export const TRACE_UAT_SYNTHETIC_GATE_BARCODE = "CTN-SO-2099-999999";

export const TRACE_UAT_MUTATION_HTTP_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths that may use POST for auth/session only (never Central scan submit). */
export const TRACE_UAT_MUTATION_ALLOWLIST_URL_FRAGMENTS: readonly string[] = [];

export interface TraceUatMutationObservation {
  method: string;
  url: string;
}

export function isMutationUrlAllowed(url: string): boolean {
  return TRACE_UAT_MUTATION_ALLOWLIST_URL_FRAGMENTS.some(fragment => url.includes(fragment));
}

export function classifyMutationRequest(method: string, url: string): boolean {
  if (!TRACE_UAT_MUTATION_HTTP_METHODS.has(method.toUpperCase())) return false;
  if (isMutationUrlAllowed(url)) return false;
  return true;
}

export function assertScenarioRoutesRegistered(): void {
  for (const scenario of TRACE_UAT_SCENARIOS) {
    const row = censusRowForRoute(scenario.censusRoute);
    if (!row) {
      throw new Error(`UAT ${scenario.uatId}: census row missing for ${scenario.censusRoute}`);
    }
    if (row.route !== scenario.route && scenario.route !== "/") {
      throw new Error(`UAT ${scenario.uatId}: route mismatch ${scenario.route} vs census ${row.route}`);
    }
  }
}

export interface TraceUatScenarioEvidence {
  uatId: string;
  censusSlug: string;
  status: TraceUatEvidenceStatus;
  route: string;
  deviceEmulation: TraceUatDeviceEmulation;
  viewport: { width: number; height: number };
  finalUrl: string;
  screenshotFile: string;
  screenshotSha256: string;
  consoleErrors: string[];
  networkErrors: string[];
  mutationObservations: TraceUatMutationObservation[];
  notes: string[];
  physicalScannerDisclaimer: string;
}

export interface TraceUatEvidenceReport {
  contractVersion: string;
  generatedAt: string;
  repoSha: string;
  deploymentSha: string | null;
  deploymentShaVerified: boolean;
  baseUrl: string;
  physicalScannerDisclaimer: string;
  scenarios: TraceUatScenarioEvidence[];
}

export function buildEvidenceReportSkeleton(opts: {
  repoSha: string;
  deploymentSha: string | null;
  deploymentShaVerified: boolean;
  baseUrl: string;
}): TraceUatEvidenceReport {
  return {
    contractVersion: TRACE_UAT_EVIDENCE_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    repoSha: opts.repoSha,
    deploymentSha: opts.deploymentSha,
    deploymentShaVerified: opts.deploymentShaVerified,
    baseUrl: opts.baseUrl,
    physicalScannerDisclaimer: TRACE_UAT_PHYSICAL_SCANNER_DISCLAIMER,
    scenarios: [],
  };
}
