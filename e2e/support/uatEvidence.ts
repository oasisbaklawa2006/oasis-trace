import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
import {
  TRACE_UAT_PHYSICAL_SCANNER_DISCLAIMER,
  type TraceUatDeviceEmulation,
  type TraceUatEvidenceReport,
  type TraceUatEvidenceStatus,
  type TraceUatMutationObservation,
  type TraceUatScenarioEvidence,
  buildEvidenceReportSkeleton,
  classifyMutationRequest,
} from "../../src/lib/traceUatEvidenceContract";

export const EVIDENCE_DIR = path.join(process.cwd(), "artifacts", "trace-uat-evidence");

export interface MutationMonitor {
  observations: TraceUatMutationObservation[];
  dispose: () => void;
}

export function attachMutationMonitor(page: Page): MutationMonitor {
  const observations: TraceUatMutationObservation[] = [];
  const handler = (request: { method: () => string; url: () => string }) => {
    const method = request.method();
    const url = request.url();
    if (classifyMutationRequest(method, url)) {
      observations.push({ method, url });
    }
  };
  page.on("request", handler);
  return {
    observations,
    dispose: () => {
      page.off("request", handler);
    },
  };
}

export function deploymentShaFromResponse(response: Response | null): string | null {
  if (!response) return null;
  const headers = response.headers();
  return (
    headers["x-vercel-git-commit-sha"]
    ?? headers["x-deployment-sha"]
    ?? headers["x-git-commit-sha"]
    ?? null
  );
}

export function isAuthOrProtectionWall(pageUrl: string, title: string, status: number): boolean {
  if (status === 401 || status === 403) return true;
  const lower = `${pageUrl} ${title}`.toLowerCase();
  return (
    lower.includes("authentication required")
    || lower.includes("vercel authentication")
    || lower.includes("login to vercel")
    || lower.includes("/login")
  );
}

export function sha256File(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

export function writeEvidenceReport(report: TraceUatEvidenceReport): string {
  ensureEvidenceDir();
  const out = path.join(EVIDENCE_DIR, "trace-uat-evidence.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return out;
}

export async function captureScenarioScreenshot(page: Page, uatId: string): Promise<{ file: string; sha256: string }> {
  ensureEvidenceDir();
  const file = path.join(EVIDENCE_DIR, `${uatId}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return { file, sha256: sha256File(file) };
}

export function finalizeScenarioStatus(opts: {
  blocked: boolean;
  failedAssertion: boolean;
  mutations: TraceUatMutationObservation[];
}): TraceUatEvidenceStatus {
  if (opts.blocked) return "BLOCKED";
  if (opts.failedAssertion || opts.mutations.length > 0) return "FAIL";
  return "PASS";
}

export function emptyScenarioEvidence(
  partial: Omit<TraceUatScenarioEvidence, "physicalScannerDisclaimer" | "mutationObservations" | "consoleErrors" | "networkErrors" | "notes">,
  mutations: TraceUatMutationObservation[],
  consoleErrors: string[],
  networkErrors: string[],
  notes: string[],
  status: TraceUatEvidenceStatus,
): TraceUatScenarioEvidence {
  return {
    ...partial,
    status,
    mutationObservations: mutations,
    consoleErrors,
    networkErrors,
    notes,
    physicalScannerDisclaimer: TRACE_UAT_PHYSICAL_SCANNER_DISCLAIMER,
  };
}

let activeReport: TraceUatEvidenceReport | null = null;

export function initEvidenceRun(opts: {
  repoSha: string;
  expectedDeploymentSha?: string;
  baseUrl: string;
}): TraceUatEvidenceReport {
  activeReport = buildEvidenceReportSkeleton({
    repoSha: opts.repoSha,
    deploymentSha: null,
    deploymentShaVerified: !opts.expectedDeploymentSha,
    baseUrl: opts.baseUrl,
  });
  return activeReport;
}

export function recordDeploymentSha(sha: string | null): void {
  if (!activeReport || !sha) return;
  activeReport.deploymentSha = sha;
  const expected = process.env.TRACE_UAT_EXPECTED_SHA?.trim();
  activeReport.deploymentShaVerified = !expected || sha === expected;
}

export function appendScenarioEvidence(evidence: TraceUatScenarioEvidence): void {
  if (!activeReport) return;
  activeReport.scenarios.push(evidence);
  activeReport.generatedAt = new Date().toISOString();
  writeEvidenceReport(activeReport);
}

export function finalizeEvidenceRun(): TraceUatEvidenceReport | null {
  if (!activeReport) return null;
  writeEvidenceReport(activeReport);
  return activeReport;
}

export function newReport(opts: {
  repoSha: string;
  deploymentSha: string | null;
  expectedDeploymentSha?: string;
  baseUrl: string;
}): TraceUatEvidenceReport {
  const verified = !opts.expectedDeploymentSha
    || (opts.deploymentSha !== null && opts.deploymentSha === opts.expectedDeploymentSha);
  return buildEvidenceReportSkeleton({
    repoSha: opts.repoSha,
    deploymentSha: opts.deploymentSha,
    deploymentShaVerified: verified,
    baseUrl: opts.baseUrl,
  });
}

export const VIEWPORTS: Record<TraceUatDeviceEmulation, { width: number; height: number }> = {
  pc: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
  handheld: { width: 800, height: 480 },
};
