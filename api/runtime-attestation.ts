// Torch Bearer runtime attestation endpoint (WO-TB-02).
// Serves the build-time manifest packaged via vercel.json `includeFiles`.
// Never reads import.meta.env or recomputes SPA config from Function env vars.
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const SHA_RE = /^[0-9a-f]{40}$/;
const ENVS = ["production", "preview", "development"];
const KEYS = ["app", "gitSha", "environment", "supabaseProjectRef", "activeFeatureFlags", "demoMode"];

function send(res: ServerResponse, status: number, body?: unknown, extra: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "private, no-store");
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  if (body === undefined) { res.end(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function tokenOk(provided: string | string[] | undefined, expected: string | undefined): boolean {
  if (!expected || typeof provided !== "string" || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal lengths; length is not treated as secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

const REF_RE = /^[a-z0-9]{20}$/;
const FLAG_KEYS = ["centralScanSubmit", "leap13Uat"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameKeys(obj: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(obj);
  return keys.length === expected.length && expected.every((k) => keys.includes(k));
}

function loadManifest(): Record<string, unknown> | null {
  try {
    const file = path.join(process.cwd(), ".torch-attestation", "runtime-attestation.json");
    const m: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isPlainObject(m) || !sameKeys(m, KEYS)) return null;
    const flags = m.activeFeatureFlags;
    if (
      m.app !== "trace" ||
      typeof m.gitSha !== "string" || !SHA_RE.test(m.gitSha) ||
      typeof m.environment !== "string" || !ENVS.includes(m.environment) ||
      typeof m.demoMode !== "boolean" ||
      !isPlainObject(flags) || !sameKeys(flags, FLAG_KEYS) ||
      !Object.values(flags).every((v) => typeof v === "boolean")
    ) return null;
    if (m.demoMode) {
      if (m.supabaseProjectRef !== null) return null;
    } else if (typeof m.supabaseProjectRef !== "string" || !REF_RE.test(m.supabaseProjectRef)) {
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") { send(res, 405, undefined, { Allow: "GET" }); return; }
  if (!tokenOk(req.headers["x-torch-attest-token"], process.env.TORCH_ATTEST_TOKEN)) { send(res, 401); return; }
  const manifest = loadManifest();
  if (!manifest) { send(res, 503); return; }
  send(res, 200, manifest);
}
