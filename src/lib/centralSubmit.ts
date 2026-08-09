/**
 * Client for Central scan submit via Supabase Edge Function (no secrets in browser).
 */
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { requireSubmitRole } from "@/lib/roles";
import type { Session } from "@supabase/supabase-js";
import type { CentralScanSyncStatus } from "@/lib/centralScanStatus";
import { listTable, updateRow } from "@/lib/data";
import { getScanUserMessage } from "@/lib/scanContract";
import { errorMessage } from "@/lib/utils";

export function isCentralSubmitEnabled(): boolean {
  return import.meta.env.VITE_CENTRAL_SCAN_SUBMIT_ENABLED === "true";
}

export interface CentralSubmitRequest {
  idempotencyKey: string;
  payload: Record<string, unknown>;
  scanHistoryId?: string;
  session: Session | null;
}

export interface CentralSubmitResult {
  ok: boolean;
  status: CentralScanSyncStatus;
  duplicate?: boolean;
  message: string;
  centralReference?: string;
  submittedAt?: string;
  failureReason?: string;
}

const MOCK_SUBMISSIONS_KEY = "ols_central_scan_submissions_mock";

function loadMockSubmissions(): Record<string, CentralSubmitResult & { payload: unknown }> {
  try {
    return JSON.parse(localStorage.getItem(MOCK_SUBMISSIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMockSubmission(key: string, value: CentralSubmitResult & { payload: unknown }) {
  const all = loadMockSubmissions();
  all[key] = value;
  localStorage.setItem(MOCK_SUBMISSIONS_KEY, JSON.stringify(all));
}

export async function hasCentralSubmission(idempotencyKey: string): Promise<boolean> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("ols_central_scan_submissions")
        .select("status")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (!error && data?.status === "submitted") return true;
    } catch {
      /* table may not exist yet — fall through */
    }
  }
  const mock = loadMockSubmissions()[idempotencyKey];
  return mock?.status === "submitted";
}

async function patchScanHistoryMetadata(
  scanHistoryId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const rows = await listTable<{ id: string; metadata?: Record<string, unknown> }>(
      "ols_scan_history",
      { limit: 1000 },
    );
    const row = rows.find(r => r.id === scanHistoryId);
    if (!row) return;
    await updateRow("ols_scan_history", scanHistoryId, {
      metadata: { ...(row.metadata || {}), ...patch },
    });
  } catch (err: unknown) {
    // Log metadata patch failures but don't crash submit flows — the scan may still have been recorded in Central.
    console.warn(`[ols] Failed to patch scan history metadata for ${scanHistoryId}:`, errorMessage(err));
  }
}

async function submitViaEdgeFunction(req: CentralSubmitRequest): Promise<CentralSubmitResult> {
  if (!supabase) {
    return {
      ok: false,
      status: "failed",
      message: "Supabase not configured",
      failureReason: "missing_supabase",
    };
  }

  const { data, error } = await supabase.functions.invoke("submit-central-scan", {
    body: {
      idempotency_key: req.idempotencyKey,
      payload: req.payload,
      scan_history_id: req.scanHistoryId ?? null,
    },
  });

  if (error) {
    const msg = error.message || "Edge function error";
    if (req.scanHistoryId) {
      await patchScanHistoryMetadata(req.scanHistoryId, {
        central_sync_status: "failed",
        central_failure_reason: msg,
      });
    }
    return { ok: false, status: "failed", message: msg, failureReason: msg };
  }

  const result = data as {
    ok?: boolean;
    duplicate?: boolean;
    message?: string;
    status?: CentralScanSyncStatus;
    central_reference?: string;
    submitted_at?: string;
    failure_reason?: string;
  };

  if (result.duplicate) {
    return {
      ok: false,
      duplicate: true,
      status: "submitted",
      message: getScanUserMessage("scan_already_recorded"),
      centralReference: result.central_reference,
      submittedAt: result.submitted_at,
    };
  }

  if (!result.ok) {
    const failureReason = result.failure_reason || result.message || "Submit failed";
    if (req.scanHistoryId) {
      await patchScanHistoryMetadata(req.scanHistoryId, {
        central_sync_status: "failed",
        central_failure_reason: failureReason,
      });
    }
    return {
      ok: false,
      status: (result.status as CentralScanSyncStatus) || "failed",
      message: failureReason,
      failureReason,
    };
  }

  if (req.scanHistoryId) {
    await patchScanHistoryMetadata(req.scanHistoryId, {
      central_sync_status: "submitted",
      central_reference: result.central_reference,
      central_submitted_at: result.submitted_at,
    });
  }

  return {
    ok: true,
    status: "submitted",
    message: "Submitted to Central",
    centralReference: result.central_reference,
    submittedAt: result.submitted_at,
  };
}

async function submitViaMock(req: CentralSubmitRequest): Promise<CentralSubmitResult> {
  const existing = loadMockSubmissions()[req.idempotencyKey];
  if (existing?.status === "submitted") {
    return {
      ok: false,
      duplicate: true,
      status: "submitted",
      message: getScanUserMessage("scan_already_recorded"),
      centralReference: existing.centralReference,
      submittedAt: existing.submittedAt,
    };
  }

  if (req.payload.verification_status !== "verified") {
    return {
      ok: false,
      status: "failed",
      message: "Only verified scans can be submitted",
      failureReason: "not_verified",
    };
  }

  const ref = `MOCK-CENTRAL-${Date.now()}`;
  const submittedAt = new Date().toISOString();
  const result: CentralSubmitResult = {
    ok: true,
    status: "submitted",
    message: "Submitted to Central (mock)",
    centralReference: ref,
    submittedAt,
  };
  saveMockSubmission(req.idempotencyKey, { ...result, payload: req.payload });

  if (req.scanHistoryId) {
    await patchScanHistoryMetadata(req.scanHistoryId, {
      central_sync_status: "submitted",
      central_reference: ref,
      central_submitted_at: submittedAt,
    });
  }

  return result;
}

/**
 * Submit a verified scan payload to Central (edge function or demo mock).
 */
export async function submitCentralScan(req: CentralSubmitRequest): Promise<CentralSubmitResult> {
  if (!req.session?.user) {
    return {
      ok: false,
      status: "failed",
      message: "Sign in required to submit scans",
      failureReason: "unauthenticated",
    };
  }

  try {
    requireSubmitRole(req.session);
  } catch (e: unknown) {
    return {
      ok: false,
      status: "failed",
      message: errorMessage(e),
      failureReason: "forbidden",
    };
  }

  if (req.payload.verification_status !== "verified") {
    return {
      ok: false,
      status: "failed",
      message: "Only verified scans can be submitted",
      failureReason: "not_verified",
    };
  }

  if (await hasCentralSubmission(req.idempotencyKey)) {
    return {
      ok: false,
      duplicate: true,
      status: "submitted",
      message: getScanUserMessage("scan_already_recorded"),
    };
  }

  if (req.scanHistoryId) {
    await patchScanHistoryMetadata(req.scanHistoryId, {
      central_sync_status: "retry_pending",
    });
  }

  if (!isCentralSubmitEnabled()) {
    return {
      ok: false,
      status: "preview_only",
      message: "Central submit is disabled. Set VITE_CENTRAL_SCAN_SUBMIT_ENABLED=true.",
      failureReason: "submit_disabled",
    };
  }

  if (supabaseConfigured && supabase) {
    return submitViaEdgeFunction(req);
  }

  return submitViaMock(req);
}

/** Retry a failed submit (same idempotency key). */
export async function retryCentralScan(req: CentralSubmitRequest): Promise<CentralSubmitResult> {
  if (req.scanHistoryId) {
    await patchScanHistoryMetadata(req.scanHistoryId, {
      central_sync_status: "retry_pending",
      central_failure_reason: null,
    });
  }
  return submitCentralScan(req);
}
