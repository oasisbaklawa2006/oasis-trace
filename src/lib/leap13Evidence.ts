/**
 * Leap13 physical-device UAT evidence capture hooks.
 * Software-only: records structured step metadata for operator scripts;
 * does not fabricate hardware success.
 */
export interface Leap13EvidenceRecord {
  scenario: string;
  step: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  integrityClass: "leap13_uat_hook_v1";
}

const STORAGE_KEY = "ols_leap13_evidence_v1";
const MAX_RECORDS = 200;

function readRecords(): Leap13EvidenceRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Leap13EvidenceRecord[] : [];
  } catch {
    return [];
  }
}

function writeRecords(records: Leap13EvidenceRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // Evidence capture is best-effort — must not break scan/reload flows.
  }
}

/** Capture a Leap13 UAT step when `VITE_LEAP13_UAT=1` or `?leap13_uat=1`. */
export function captureLeap13Evidence(
  scenario: string,
  step: string,
  payload: Record<string, unknown> = {},
): Leap13EvidenceRecord | null {
  const enabled = import.meta.env.VITE_LEAP13_UAT === "1"
    || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("leap13_uat"));
  if (!enabled) return null;

  const record: Leap13EvidenceRecord = {
    scenario,
    step,
    occurredAt: new Date().toISOString(),
    payload,
    integrityClass: "leap13_uat_hook_v1",
  };
  const records = readRecords();
  records.push(record);
  writeRecords(records);
  if (import.meta.env.DEV) {
    console.info("[leap13-uat]", scenario, step, payload);
  }
  return record;
}

export function listLeap13Evidence(): Leap13EvidenceRecord[] {
  return readRecords();
}

export function clearLeap13Evidence(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function exportLeap13EvidenceJson(): string {
  return JSON.stringify(listLeap13Evidence(), null, 2);
}
