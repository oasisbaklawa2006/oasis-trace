/**
 * Point 96 — offline / transient-network retry for governed Central scan submit.
 *
 * Persists pending scan envelopes locally (localStorage), replays with the same
 * deterministic idempotency key, bounded exponential backoff, FIFO ordering, and
 * visible permanent-authority rejection (no silent drop or duplicate submit).
 *
 * Does not invent scan success — delegates to centralSubmit + Core edge function.
 */
import type { Session } from "@supabase/supabase-js";
import { isOnline, subscribeOnline } from "@/lib/data";
import {
  submitCentralScan,
  type CentralSubmitRequest,
  type CentralSubmitResult,
} from "@/lib/centralSubmit";
import { errorMessage } from "@/lib/utils";

export interface PendingScanEnvelope {
  idempotencyKey: string;
  payload: Record<string, unknown>;
  scanHistoryId?: string;
  /** Immutable owner captured at enqueue time — replay only under matching session. */
  ownerUserId: string;
  enqueuedAt: number;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  permanentFailure?: boolean;
  failureReason?: string;
}

export interface ScanSubmitQueueFlushResult {
  ok: number;
  failed: number;
  permanent: number;
  skipped: number;
}

const STORAGE_KEY = "ols_scan_submit_queue";
const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const FLUSH_INTERVAL_MS = 15_000;

/** Authority / validation failures that must not be silently retried. */
const PERMANENT_FAILURE_REASONS = new Set([
  "unauthenticated",
  "forbidden",
  "not_verified",
  "invalid_request",
  "submit_disabled",
]);

type QueueListener = (size: number) => void;
const listeners = new Set<QueueListener>();
let flushing = false;

export function isPermanentSubmitFailure(reason?: string): boolean {
  if (!reason) return false;
  const normalized = reason.toLowerCase();
  if (PERMANENT_FAILURE_REASONS.has(normalized)) return true;
  if (normalized.includes("forbidden") || normalized.includes("not_verified")) return true;
  return false;
}

function currentOwnerId(): string | undefined {
  return sessionProvider?.()?.user?.id;
}

function notify() {
  const size = getRetryableQueueSize();
  listeners.forEach(l => l(size));
}

function loadQueue(): PendingScanEnvelope[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingScanEnvelope[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(items: PendingScanEnvelope[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode — best effort */
  }
  notify();
}

function backoffMs(attempts: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
  return exp;
}

function upsertEnvelope(req: CentralSubmitRequest): PendingScanEnvelope {
  const ownerUserId = req.session?.user?.id;
  if (!ownerUserId) {
    throw new Error("Session required to enqueue scan submission");
  }

  const queue = loadQueue();
  const existing = queue.find(e => e.idempotencyKey === req.idempotencyKey);
  if (existing && !existing.permanentFailure) {
    return existing;
  }
  const envelope: PendingScanEnvelope = {
    idempotencyKey: req.idempotencyKey,
    payload: req.payload,
    scanHistoryId: req.scanHistoryId,
    ownerUserId,
    enqueuedAt: Date.now(),
    attempts: 0,
    nextRetryAt: Date.now(),
  };
  const withoutDup = queue.filter(e => e.idempotencyKey !== req.idempotencyKey);
  withoutDup.push(envelope);
  saveQueue(withoutDup);
  return envelope;
}

/** Persist a scan envelope for later replay (idempotent on key). */
export function enqueuePendingScan(req: CentralSubmitRequest): PendingScanEnvelope {
  return upsertEnvelope(req);
}

export function removePendingScan(idempotencyKey: string): void {
  const queue = loadQueue().filter(e => e.idempotencyKey !== idempotencyKey);
  saveQueue(queue);
}

export function getPendingScans(): PendingScanEnvelope[] {
  return loadQueue().slice().sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

export function getRetryableQueueSize(): number {
  const ownerId = currentOwnerId();
  return loadQueue().filter(e => {
    if (e.permanentFailure) return false;
    if (!e.ownerUserId) return false;
    if (ownerId && e.ownerUserId !== ownerId) return false;
    return true;
  }).length;
}

export function getPermanentFailures(): PendingScanEnvelope[] {
  return loadQueue().filter(e => e.permanentFailure);
}

export function subscribeScanQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(getRetryableQueueSize());
  return () => listeners.delete(listener);
}

function markPermanentFailure(
  idempotencyKey: string,
  result: CentralSubmitResult,
): PendingScanEnvelope | undefined {
  const queue = loadQueue();
  const idx = queue.findIndex(e => e.idempotencyKey === idempotencyKey);
  if (idx < 0) return undefined;
  const updated: PendingScanEnvelope = {
    ...queue[idx],
    permanentFailure: true,
    failureReason: result.failureReason || result.message,
    lastError: result.message,
  };
  queue[idx] = updated;
  saveQueue(queue);
  return updated;
}

function recordTransientFailure(idempotencyKey: string, message: string): void {
  const queue = loadQueue();
  const idx = queue.findIndex(e => e.idempotencyKey === idempotencyKey);
  if (idx < 0) return;
  const item = queue[idx];
  const attempts = item.attempts + 1;
  queue[idx] = {
    ...item,
    attempts,
    lastError: message,
    nextRetryAt: Date.now() + backoffMs(attempts),
    permanentFailure: attempts >= MAX_ATTEMPTS ? true : item.permanentFailure,
    failureReason: attempts >= MAX_ATTEMPTS ? "max_attempts_exceeded" : item.failureReason,
  };
  saveQueue(queue);
}

function shouldAttemptNow(item: PendingScanEnvelope, now: number): boolean {
  if (item.permanentFailure) return false;
  return now >= item.nextRetryAt;
}

/**
 * Submit now or enqueue when offline / on transient failure.
 * Success and Central duplicate both drain the pending envelope.
 */
export async function submitWithOfflineRetry(
  req: CentralSubmitRequest,
): Promise<CentralSubmitResult & { queued?: boolean }> {
  if (!req.session?.user) {
    return {
      ok: false,
      status: "failed",
      message: "Sign in required to submit scans",
      failureReason: "unauthenticated",
    };
  }

  if (!isOnline()) {
    enqueuePendingScan(req);
    return {
      ok: false,
      status: "retry_pending",
      message: "Offline — scan queued for Central submit when connectivity returns",
      queued: true,
    };
  }

  let result: CentralSubmitResult;
  try {
    result = await submitCentralScan(req);
  } catch (err: unknown) {
    enqueuePendingScan(req);
    recordTransientFailure(req.idempotencyKey, errorMessage(err));
    return {
      ok: false,
      status: "retry_pending",
      message: errorMessage(err, "Network error — queued for retry"),
      failureReason: "network_error",
      queued: true,
    };
  }

  if (result.ok || result.duplicate) {
    removePendingScan(req.idempotencyKey);
    return result;
  }

  if (isPermanentSubmitFailure(result.failureReason)) {
    enqueuePendingScan(req);
    markPermanentFailure(req.idempotencyKey, result);
    return result;
  }

  enqueuePendingScan(req);
  recordTransientFailure(req.idempotencyKey, result.message);
  return {
    ...result,
    status: "retry_pending",
    queued: true,
  };
}

/**
 * Replay pending envelopes in FIFO order. Requires a live session.
 */
export async function flushScanSubmitQueue(
  session: Session | null,
): Promise<ScanSubmitQueueFlushResult> {
  if (flushing) return { ok: 0, failed: 0, permanent: 0, skipped: 0 };
  if (!session?.user || !isOnline()) return { ok: 0, failed: 0, permanent: 0, skipped: 0 };

  flushing = true;
  let ok = 0;
  let failed = 0;
  let permanent = 0;
  let skipped = 0;

  try {
    const now = Date.now();
    const queue = getPendingScans();

    for (const item of queue) {
      if (item.permanentFailure) {
        permanent++;
        continue;
      }
      if (!item.ownerUserId || item.ownerUserId !== session.user.id) {
        continue;
      }
      if (!shouldAttemptNow(item, now)) {
        skipped++;
        break;
      }

      const req: CentralSubmitRequest = {
        idempotencyKey: item.idempotencyKey,
        payload: item.payload,
        scanHistoryId: item.scanHistoryId,
        session,
      };

      let result: CentralSubmitResult;
      try {
        result = await submitCentralScan(req);
      } catch (err: unknown) {
        recordTransientFailure(item.idempotencyKey, errorMessage(err));
        failed++;
        break;
      }

      if (result.ok || result.duplicate) {
        removePendingScan(item.idempotencyKey);
        ok++;
        continue;
      }

      if (isPermanentSubmitFailure(result.failureReason)) {
        markPermanentFailure(item.idempotencyKey, result);
        permanent++;
        continue;
      }

      recordTransientFailure(item.idempotencyKey, result.message);
      failed++;
      break;
    }
  } finally {
    flushing = false;
  }

  return { ok, failed, permanent, skipped };
}

let sessionProvider: (() => Session | null) | null = null;

/** Register auth session source for reconnect / interval auto-flush. */
export function registerScanQueueSessionProvider(provider: () => Session | null) {
  sessionProvider = provider;
  notify();
}

/** Clear session provider on unmount/logout to prevent stale-session replay. */
export function unregisterScanQueueSessionProvider() {
  sessionProvider = null;
  notify();
}

// Auto-replay on reconnect + periodic flush while retryable items remain.
if (typeof window !== "undefined") {
  subscribeOnline((online) => {
    if (online && sessionProvider) {
      void flushScanSubmitQueue(sessionProvider());
    }
  });

  setInterval(() => {
    if (getRetryableQueueSize() > 0 && sessionProvider) {
      void flushScanSubmitQueue(sessionProvider());
    }
  }, FLUSH_INTERVAL_MS);
}
