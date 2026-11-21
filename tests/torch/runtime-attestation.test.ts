// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import handler from "../../api/runtime-attestation";
import { buildManifest, torchAttestationManifest } from "../../scripts/torch-attestation-manifest";

const TOKEN = "test-runtime-attestation-token";
const GIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const REF = "abcdefghij0123456789";
const ANON_KEY = "test-anon-key-not-for-response";
const ENV_KEYS = [
  "TORCH_ATTEST_TOKEN",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_ENV",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_CENTRAL_SCAN_SUBMIT_ENABLED",
  "VITE_LEAP13_UAT",
];

type TestResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(name: string, value: string | number): void;
  end(chunk?: string | Buffer): void;
};

let root = "";
let originalCwd = "";
let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalCwd = process.cwd();
  originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  root = mkdtempSync(path.join(tmpdir(), "runtime-attestation-"));
  process.chdir(root);
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.TORCH_ATTEST_TOKEN = TOKEN;
  process.env.VERCEL_GIT_COMMIT_SHA = GIT_SHA;
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function request(method = "GET", token?: string | string[]): TestResponse {
  const res: TestResponse = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
    },
    end(chunk) {
      this.body = chunk?.toString() ?? "";
    },
  };
  handler(
    { method, headers: token === undefined ? {} : { "x-torch-attest-token": token } } as IncomingMessage,
    res as unknown as ServerResponse,
  );
  return res;
}

function expectPrivateNoStore(res: TestResponse) {
  expect(res.headers["cache-control"]).toBe("private, no-store");
}

function writeManifest(value: unknown) {
  const directory = path.join(root, ".torch-attestation");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "runtime-attestation.json"), JSON.stringify(value));
}

function containsManifestFile(directory: string): boolean {
  if (!readdirSync(directory, { withFileTypes: true }).length) return false;
  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? containsManifestFile(entryPath)
      : entry.name === "runtime-attestation.json";
  });
}

describe("Torch runtime attestation", () => {
  it("rejects missing and invalid tokens without metadata and rejects non-GET methods", () => {
    for (const token of [undefined, "wrong-token", ["multiple", "values"]]) {
      const res = request("GET", token);
      expect(res.statusCode).toBe(401);
      expect(res.body).toBe("");
      expectPrivateNoStore(res);
    }

    const post = request("POST", TOKEN);
    expect(post.statusCode).toBe(405);
    expect(post.body).toBe("");
    expect(post.headers.allow).toBe("GET");
    expectPrivateNoStore(post);
  });

  it("returns only the six-key live contract and excludes secrets", () => {
    process.env.VERCEL_ENV = "production";
    const manifest = buildManifest({
      VITE_SUPABASE_URL: `https://${REF}.supabase.co`,
      VITE_SUPABASE_ANON_KEY: ANON_KEY,
      VITE_CENTRAL_SCAN_SUBMIT_ENABLED: "true",
      VITE_LEAP13_UAT: "0",
    }, process.env);
    expect(manifest).not.toBeNull();
    writeManifest(manifest);

    const res = request("GET", TOKEN);
    expect(res.statusCode).toBe(200);
    expectPrivateNoStore(res);
    const body = JSON.parse(res.body);
    expect(Object.keys(body).sort()).toEqual([
      "activeFeatureFlags",
      "app",
      "demoMode",
      "environment",
      "gitSha",
      "supabaseProjectRef",
    ]);
    expect(body).toEqual({
      app: "trace",
      gitSha: GIT_SHA,
      environment: "production",
      supabaseProjectRef: REF,
      activeFeatureFlags: { centralScanSubmit: true, leap13Uat: false },
      demoMode: false,
    });
    expect(res.body).not.toContain(TOKEN);
    expect(res.body).not.toContain(ANON_KEY);
  });

  it("returns a bootable demo manifest with a null project ref", () => {
    process.env.VERCEL_ENV = "preview";
    const manifest = buildManifest({}, process.env);
    expect(manifest).not.toBeNull();
    writeManifest(manifest);

    const res = request("GET", TOKEN);
    expect(res.statusCode).toBe(200);
    expectPrivateNoStore(res);
    expect(JSON.parse(res.body)).toMatchObject({
      supabaseProjectRef: null,
      demoMode: true,
    });
  });

  it("returns 503 without metadata for missing, corrupt, or broken manifests", () => {
    const missing = request("GET", TOKEN);
    expect(missing.statusCode).toBe(503);
    expect(missing.body).toBe("");
    expectPrivateNoStore(missing);

    mkdirSync(path.join(root, ".torch-attestation"), { recursive: true });
    writeFileSync(path.join(root, ".torch-attestation", "runtime-attestation.json"), "{not-json");
    const corrupt = request("GET", TOKEN);
    expect(corrupt.statusCode).toBe(503);
    expect(corrupt.body).toBe("");
    expectPrivateNoStore(corrupt);

    writeManifest({
      app: "trace",
      gitSha: GIT_SHA,
      environment: "production",
      supabaseProjectRef: REF,
      activeFeatureFlags: { centralScanSubmit: "enabled", leap13Uat: false },
      demoMode: false,
    });
    const brokenConfig = request("GET", TOKEN);
    expect(brokenConfig.statusCode).toBe(503);
    expect(brokenConfig.body).toBe("");
    expectPrivateNoStore(brokenConfig);
  });

  const liveManifest = (overrides: Record<string, unknown> = {}) => ({
    app: "trace",
    gitSha: GIT_SHA,
    environment: "production",
    supabaseProjectRef: REF,
    activeFeatureFlags: { centralScanSubmit: true, leap13Uat: false },
    demoMode: false,
    ...overrides,
  });

  function expect503(manifest: unknown) {
    writeManifest(manifest);
    const res = request("GET", TOKEN);
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("");
    expectPrivateNoStore(res);
  }

  it("does not build a live manifest when the Supabase project ref cannot be derived", () => {
    for (const url of ["https://db.example.com", "https://short.supabase.co", "not a url"]) {
      expect(buildManifest({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: ANON_KEY }, process.env)).toBeNull();
    }
    expect(buildManifest({}, process.env)).toMatchObject({ demoMode: true, supabaseProjectRef: null });
  });

  it("returns 503 for a live manifest with a null or malformed project ref", () => {
    for (const ref of [null, "", "short", "ABCDEFGHIJ0123456789", "abcdefghij012345678", "abcdefghij01234567890", "abcdefghij-123456789", 12345]) {
      expect503(liveManifest({ supabaseProjectRef: ref }));
    }
  });

  it("returns 200 for a bootable demo manifest and 503 when demo carries a ref", () => {
    writeManifest(liveManifest({ supabaseProjectRef: null, demoMode: true }));
    const res = request("GET", TOKEN);
    expect(res.statusCode).toBe(200);
    expectPrivateNoStore(res);
    expect(JSON.parse(res.body)).toMatchObject({ supabaseProjectRef: null, demoMode: true });
    expect503(liveManifest({ supabaseProjectRef: REF, demoMode: true }));
  });

  it("returns 503 when activeFeatureFlags has missing, extra, or non-boolean keys", () => {
    expect503(liveManifest({ activeFeatureFlags: { centralScanSubmit: true } }));
    expect503(liveManifest({ activeFeatureFlags: { leap13Uat: true } }));
    expect503(liveManifest({ activeFeatureFlags: {} }));
    expect503(liveManifest({ activeFeatureFlags: { centralScanSubmit: true, leap13Uat: false, extra: true } }));
    expect503(liveManifest({ activeFeatureFlags: { centralScanSubmit: true, leap13Uat: "no" } }));
    expect503(liveManifest({ activeFeatureFlags: [true, false] }));
    expect503(liveManifest({ activeFeatureFlags: null }));
  });

  it("serves baked Vite config despite changed Function env and keeps the manifest out of static assets", () => {
    const publicDirectory = path.join(root, "public");
    const distDirectory = path.join(root, "dist");
    mkdirSync(publicDirectory);
    mkdirSync(distDirectory);
    writeFileSync(path.join(publicDirectory, "index.html"), "public SPA");
    writeFileSync(path.join(distDirectory, "index.html"), "built SPA");
    writeFileSync(
      path.join(root, ".env.test"),
      [
        "VITE_SUPABASE_URL=https://bakedproject00000000.supabase.co",
        `VITE_SUPABASE_ANON_KEY=${ANON_KEY}`,
        "VITE_CENTRAL_SCAN_SUBMIT_ENABLED=true",
        "VITE_LEAP13_UAT=1",
      ].join("\n"),
    );

    const plugin = torchAttestationManifest();
    const resolveConfig = plugin.configResolved as unknown as (config: unknown) => void;
    resolveConfig({
      root,
      envDir: root,
      mode: "test",
      logger: { warn() {} },
    });

    const manifestPath = path.join(root, ".torch-attestation", "runtime-attestation.json");
    const bakedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(bakedManifest.supabaseProjectRef).toBe("bakedproject00000000");
    expect(bakedManifest.activeFeatureFlags).toEqual({ centralScanSubmit: true, leap13Uat: true });
    expect(containsManifestFile(publicDirectory)).toBe(false);
    expect(containsManifestFile(distDirectory)).toBe(false);

    process.env.VITE_SUPABASE_URL = "https://runtimeproject000000.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "runtime-secret";
    process.env.VITE_CENTRAL_SCAN_SUBMIT_ENABLED = "false";
    process.env.VITE_LEAP13_UAT = "0";
    const res = request("GET", TOKEN);
    expect(res.statusCode).toBe(200);
    expectPrivateNoStore(res);
    const body = JSON.parse(res.body);
    expect(body.supabaseProjectRef).toBe("bakedproject00000000");
    expect(body.activeFeatureFlags).toEqual({ centralScanSubmit: true, leap13Uat: true });
    expect(res.body).not.toContain("runtime-secret");
  });
});
