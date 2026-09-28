import { test, expect } from "@playwright/test";
import {
  TRACE_UAT_SCENARIOS,
  TRACE_UAT_SYNTHETIC_GATE_BARCODE,
} from "../src/lib/traceUatEvidenceContract";
import {
  EVIDENCE_DIR,
  VIEWPORTS,
  appendScenarioEvidence,
  attachMutationMonitor,
  captureScenarioScreenshot,
  deploymentShaFromResponse,
  emptyScenarioEvidence,
  finalizeEvidenceRun,
  finalizeScenarioStatus,
  initEvidenceRun,
  isAuthOrProtectionWall,
  recordDeploymentSha,
} from "./support/uatEvidence";

const repoSha = process.env.TRACE_UAT_REPO_SHA ?? process.env.GITHUB_SHA ?? "unknown";
const expectedDeploymentSha = process.env.TRACE_UAT_EXPECTED_SHA?.trim() || undefined;
const baseUrl = process.env.TRACE_UAT_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

test.describe.configure({ mode: "serial" });

test.describe("Trace UAT evidence harness (read-only)", () => {
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  let runBlocked = false;

  test.beforeAll(() => {
    initEvidenceRun({ repoSha, expectedDeploymentSha, baseUrl });
  });

  test.afterAll(() => {
    finalizeEvidenceRun();
  });

  test.beforeEach(({ page }) => {
    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("response", response => {
      if (response.status() >= 400) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });
  });

  test("UAT-0128 scan-home — Control Tower software surface", async ({ page }) => {
    const scenario = TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0128")!;
    const viewport = VIEWPORTS.pc;
    const monitor = attachMutationMonitor(page);
    await page.setViewportSize(viewport);

    const response = await page.goto(scenario.route, { waitUntil: "domcontentloaded" });
    const deploymentSha = deploymentShaFromResponse(response);
    recordDeploymentSha(deploymentSha);

    const title = await page.title();
    const authWall = isAuthOrProtectionWall(page.url(), title, response?.status() ?? 0);
    const shaMismatch = Boolean(expectedDeploymentSha && deploymentSha && deploymentSha !== expectedDeploymentSha);
    const blocked = authWall || shaMismatch;
    if (blocked) runBlocked = true;

    if (!blocked) {
      await expect(page.getByRole("heading", { name: /Control Tower/i })).toBeVisible();
      await expect(page.getByText(/Auto-refreshes every 30s/i)).toBeVisible();
    }

    const shot = await captureScenarioScreenshot(page, scenario.uatId);
    const status = finalizeScenarioStatus({ blocked, failedAssertion: false, mutations: monitor.observations });
    monitor.dispose();

    appendScenarioEvidence(emptyScenarioEvidence(
      {
        uatId: scenario.uatId,
        censusSlug: scenario.censusSlug,
        status,
        route: scenario.route,
        deviceEmulation: "pc",
        viewport,
        finalUrl: page.url(),
        screenshotFile: shot.file,
        screenshotSha256: shot.sha256,
      },
      [...monitor.observations],
      [...consoleErrors],
      [...networkErrors],
      blocked
        ? ["BLOCKED: auth/protection wall or deployment SHA mismatch."]
        : ["Software surface only — no scan submit performed."],
      status,
    ));

    if (status === "BLOCKED") test.skip();
    expect(status).toBe("PASS");
  });

  test("UAT-0129 gate-scan — synthetic validation without dispatch mutation", async ({ page }) => {
    if (runBlocked) test.skip();

    const scenario = TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0129")!;
    const viewport = VIEWPORTS.handheld;
    const monitor = attachMutationMonitor(page);
    await page.setViewportSize(viewport);

    await page.goto(scenario.route, { waitUntil: "domcontentloaded" });

    const input = page.getByRole("textbox", { name: "Gate scan barcode input" });
    await expect(input).toBeVisible();
    await input.fill(TRACE_UAT_SYNTHETIC_GATE_BARCODE);
    await input.press("Enter");
    await expect(page.getByRole("status").getByText(/Order not found/i)).toBeVisible({ timeout: 15_000 });

    const shot = await captureScenarioScreenshot(page, scenario.uatId);
    const status = finalizeScenarioStatus({ blocked: false, failedAssertion: false, mutations: monitor.observations });
    monitor.dispose();

    appendScenarioEvidence(emptyScenarioEvidence(
      {
        uatId: scenario.uatId,
        censusSlug: scenario.censusSlug,
        status,
        route: scenario.route,
        deviceEmulation: "handheld",
        viewport,
        finalUrl: page.url(),
        screenshotFile: shot.file,
        screenshotSha256: shot.sha256,
      },
      [...monitor.observations],
      [...consoleErrors],
      [...networkErrors],
      [
        `Synthetic barcode ${TRACE_UAT_SYNTHETIC_GATE_BARCODE} — order_not_found path only.`,
        "No Central submit or legacy shipping QR path exercised.",
      ],
      status,
    ));
    expect(status).toBe("PASS");
  });

  test("UAT-0130 carton-scan — UI inputs without carton lifecycle", async ({ page }) => {
    if (runBlocked) test.skip();

    const scenario = TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0130")!;
    const viewport = VIEWPORTS.mobile;
    const monitor = attachMutationMonitor(page);
    await page.setViewportSize(viewport);

    await page.goto(scenario.route, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /Cartonization & Packing/i })).toBeVisible();
    await expect(page.getByText("Select order")).toBeVisible();
    await expect(page.getByRole("button", { name: /Start Carton/i })).toBeVisible();

    const shot = await captureScenarioScreenshot(page, scenario.uatId);
    const status = finalizeScenarioStatus({ blocked: false, failedAssertion: false, mutations: monitor.observations });
    monitor.dispose();

    appendScenarioEvidence(emptyScenarioEvidence(
      {
        uatId: scenario.uatId,
        censusSlug: scenario.censusSlug,
        status,
        route: scenario.route,
        deviceEmulation: "mobile",
        viewport,
        finalUrl: page.url(),
        screenshotFile: shot.file,
        screenshotSha256: shot.sha256,
      },
      [...monitor.observations],
      [...consoleErrors],
      [...networkErrors],
      ["Order picker and scan placeholders verified; Start Carton not invoked."],
      status,
    ));
    expect(status).toBe("PASS");
  });

  test("UAT-0131 offline-queue — offline banner without replay", async ({ page, context }) => {
    if (runBlocked) test.skip();

    const scenario = TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0131")!;
    const viewport = VIEWPORTS.handheld;
    const monitor = attachMutationMonitor(page);
    await page.setViewportSize(viewport);

    await page.goto(scenario.route, { waitUntil: "domcontentloaded" });

    await context.setOffline(true);
    await expect(page.getByText(/Offline mode/i)).toBeVisible({ timeout: 10_000 });

    const queueBefore = await page.evaluate(() => localStorage.getItem("ols_scan_submit_queue"));
    await context.setOffline(false);
    await expect(page.getByText(/Offline mode/i)).toBeHidden({ timeout: 10_000 });
    const queueAfter = await page.evaluate(() => localStorage.getItem("ols_scan_submit_queue"));
    expect(queueAfter).toBe(queueBefore);

    const shot = await captureScenarioScreenshot(page, scenario.uatId);
    const status = finalizeScenarioStatus({ blocked: false, failedAssertion: false, mutations: monitor.observations });
    monitor.dispose();

    appendScenarioEvidence(emptyScenarioEvidence(
      {
        uatId: scenario.uatId,
        censusSlug: scenario.censusSlug,
        status,
        route: scenario.route,
        deviceEmulation: "handheld",
        viewport,
        finalUrl: page.url(),
        screenshotFile: shot.file,
        screenshotSha256: shot.sha256,
      },
      [...monitor.observations],
      [...consoleErrors],
      [...networkErrors],
      ["Network offline toggled; scan submit queue localStorage unchanged; network restored."],
      status,
    ));
    expect(status).toBe("PASS");
  });
});

test.afterAll(() => {
  console.log(`Trace UAT evidence artifacts: ${EVIDENCE_DIR}`);
});
