/// <reference types="vite/client" />
// Generates the server-only Torch Bearer runtime-attestation manifest during
// `vite build`. Uses the SAME Supabase config + Demo Mode predicates as
// src/lib/supabase.ts / src/lib/data.ts. The manifest is written OUTSIDE dist/
// and public/ (ignored by git) and packaged with api/runtime-attestation.ts via
// vercel.json `includeFiles`.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadEnv, type Plugin } from "vite";
import { isSupabaseConfigured } from "../src/lib/supabase";

const SHA_RE = /^[0-9a-f]{40}$/;
const ENVIRONMENTS = ["production", "preview", "development"] as const;

export interface TorchAttestationManifest {
  app: "trace";
  gitSha: string;
  environment: (typeof ENVIRONMENTS)[number];
  supabaseProjectRef: string | null;
  activeFeatureFlags: Record<string, boolean>;
  demoMode: boolean;
}

function resolveGitSha(env: NodeJS.ProcessEnv): string | null {
  const candidates: (string | undefined)[] = [env.VERCEL_GIT_COMMIT_SHA];
  try {
    candidates.push(execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString());
  } catch {
    // Not a git checkout (or git unavailable): fall back to VERCEL_GIT_COMMIT_SHA only.
  }
  for (const c of candidates) {
    const v = c?.trim().toLowerCase();
    if (v && SHA_RE.test(v)) return v;
  }
  return null;
}

function resolveEnvironment(env: NodeJS.ProcessEnv): TorchAttestationManifest["environment"] {
  const v = env.VERCEL_ENV;
  return (ENVIRONMENTS as readonly string[]).includes(v ?? "") ? (v as TorchAttestationManifest["environment"]) : "development";
}

/** `https://<20-char ref>.supabase.co` -> `<ref>`; anything else -> null (same rule the endpoint enforces). */
export function supabaseProjectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const m = /^([a-z0-9]{20})\.supabase\.(co|in)$/i.exec(new URL(url).hostname);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null; // unparseable URL
  }
}

export function buildManifest(viteEnv: Record<string, string | undefined>, procEnv: NodeJS.ProcessEnv): TorchAttestationManifest | null {
  const gitSha = resolveGitSha(procEnv);
  if (!gitSha) return null;
  const url = viteEnv.VITE_SUPABASE_URL;
  const configured = isSupabaseConfigured(url, viteEnv.VITE_SUPABASE_ANON_KEY);
  // Same rule as src/lib/data.ts: demo storage is used iff `!supabaseConfigured`.
  const demoMode = !configured;
  const supabaseProjectRef = demoMode ? null : supabaseProjectRefFromUrl(url);
  // A live manifest without a derivable project ref would be rejected (503) by the
  // endpoint, so never produce one.
  if (!demoMode && supabaseProjectRef === null) return null;
  return {
    app: "trace",
    gitSha,
    environment: resolveEnvironment(procEnv),
    supabaseProjectRef,
    // Explicit allowlist — mirrors flags read in src/lib/centralSubmit.ts and leap13Evidence.ts.
    activeFeatureFlags: {
      centralScanSubmit: viteEnv.VITE_CENTRAL_SCAN_SUBMIT_ENABLED === "true",
      leap13Uat: viteEnv.VITE_LEAP13_UAT === "1",
    },
    demoMode,
  };
}

export function torchAttestationManifest(): Plugin {
  return {
    name: "torch-attestation-manifest",
    apply: "build",
    configResolved(config) {
      const viteEnv = loadEnv(config.mode, config.envDir || config.root, "VITE_");
      // Literal, cwd-relative paths (cwd is the project root during `vite build`;
      // api/runtime-attestation.ts reads the same location at runtime).
      rmSync(".torch-attestation", { recursive: true, force: true });
      const manifest = buildManifest(viteEnv, process.env);
      if (!manifest) {
        config.logger.warn("[torch-attestation] no valid git SHA or (for live config) 20-char Supabase project ref; manifest NOT written (endpoint will return 503).");
        return;
      }
      mkdirSync(".torch-attestation", { recursive: true });
      writeFileSync(".torch-attestation/runtime-attestation.json", JSON.stringify(manifest) + "\n", { mode: 0o600 });
    },
  };
}
