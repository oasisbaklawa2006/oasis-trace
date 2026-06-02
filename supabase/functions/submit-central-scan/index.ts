/**
 * Submit verified Barcode App scan payloads to Oasis Central.
 * Secrets (server-side only): SUPABASE_SERVICE_ROLE_KEY, CENTRAL_SCAN_INGEST_URL,
 * CENTRAL_SCAN_SIGNING_SECRET
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBMIT_ROLES = ["admin", "dispatch", "security"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "unauthenticated", message: "Sign in required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ ok: false, error: "unauthenticated", message: "Invalid session" }, 401);
    }

    const roles: string[] =
      userData.user.app_metadata?.ols_roles ??
      userData.user.user_metadata?.ols_roles ??
      [];
    if (!roles.some(r => SUBMIT_ROLES.includes(r))) {
      return json({
        ok: false,
        error: "forbidden",
        message: "Dispatch or security role required",
      }, 403);
    }

    const body = await req.json();
    const idempotency_key = String(body.idempotency_key || "").trim();
    const payload = body.payload;
    const scan_history_id = body.scan_history_id ?? null;

    if (!idempotency_key || !payload) {
      return json({ ok: false, error: "invalid_request", message: "idempotency_key and payload required" }, 400);
    }

    if (payload.verification_status && payload.verification_status !== "verified") {
      return json({
        ok: false,
        error: "not_verified",
        message: "Only verified scans can be submitted",
      }, 400);
    }

    const admin = serviceKey
      ? createClient(supabaseUrl, serviceKey)
      : userClient;

    const { data: existing } = await admin
      .from("ols_central_scan_submissions")
      .select("*")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existing?.status === "submitted") {
      return json({
        ok: false,
        duplicate: true,
        message: "Scan already recorded",
        status: "submitted",
        central_reference: existing.central_reference,
        submitted_at: existing.submitted_at,
      }, 409);
    }

    const submissionRow = {
      scan_history_id,
      idempotency_key,
      payload,
      status: "retry_pending",
      created_by: userData.user.id,
      failure_reason: null,
    };

    let submissionId = existing?.id;
    if (existing) {
      await admin.from("ols_central_scan_submissions").update({
        status: "retry_pending",
        payload,
        scan_history_id,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("ols_central_scan_submissions")
        .insert(submissionRow)
        .select("id")
        .single();
      if (insErr) throw insErr;
      submissionId = inserted.id;
    }

    const centralUrl = Deno.env.get("CENTRAL_SCAN_INGEST_URL");
    const signingSecret = Deno.env.get("CENTRAL_SCAN_SIGNING_SECRET");

    if (!centralUrl) {
      const ref = `DRY-RUN-${Date.now()}`;
      const submitted_at = new Date().toISOString();
      await admin.from("ols_central_scan_submissions").update({
        status: "submitted",
        central_reference: ref,
        submitted_at,
      }).eq("id", submissionId);

      if (scan_history_id) {
        await patchScanHistory(admin, scan_history_id, {
          central_sync_status: "submitted",
          central_reference: ref,
          central_submitted_at: submitted_at,
        });
      }

      return json({
        ok: true,
        status: "submitted",
        central_reference: ref,
        submitted_at,
        dry_run: true,
      });
    }

    const bodyStr = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotency_key,
      "X-Source-App": "barcode_app",
    };
    if (signingSecret) {
      headers["X-Oasis-Signature"] = await hmacSha256Hex(signingSecret, bodyStr);
    }

    const centralResp = await fetch(centralUrl, {
      method: "POST",
      headers,
      body: bodyStr,
    });

    if (!centralResp.ok) {
      const errText = await centralResp.text().catch(() => "");
      const failure_reason = `Central HTTP ${centralResp.status}: ${errText.slice(0, 500)}`;
      await admin.from("ols_central_scan_submissions").update({
        status: "failed",
        failure_reason,
      }).eq("id", submissionId);

      if (scan_history_id) {
        await patchScanHistory(admin, scan_history_id, {
          central_sync_status: "failed",
          central_failure_reason: failure_reason,
        });
      }

      return json({ ok: false, status: "failed", failure_reason }, 502);
    }

    const centralJson = await centralResp.json().catch(() => ({}));
    const central_reference =
      centralJson.id ?? centralJson.reference ?? centralJson.scan_id ?? `CENTRAL-${Date.now()}`;
    const submitted_at = new Date().toISOString();

    await admin.from("ols_central_scan_submissions").update({
      status: "submitted",
      central_reference,
      submitted_at,
      failure_reason: null,
    }).eq("id", submissionId);

    if (scan_history_id) {
      await patchScanHistory(admin, scan_history_id, {
        central_sync_status: "submitted",
        central_reference,
        central_submitted_at: submitted_at,
      });
    }

    return json({
      ok: true,
      status: "submitted",
      central_reference,
      submitted_at,
    });
  } catch (e) {
    console.error("[submit-central-scan]", e);
    return json({
      ok: false,
      error: "internal_error",
      message: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});

async function patchScanHistory(
  admin: ReturnType<typeof createClient>,
  scanHistoryId: string,
  patch: Record<string, unknown>,
) {
  const { data: row } = await admin
    .from("ols_scan_history")
    .select("metadata")
    .eq("id", scanHistoryId)
    .maybeSingle();
  if (!row) return;
  await admin.from("ols_scan_history").update({
    metadata: { ...(row.metadata || {}), ...patch },
  }).eq("id", scanHistoryId);
}
