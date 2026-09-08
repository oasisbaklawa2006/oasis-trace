#!/usr/bin/env bash
# Production-bound recertification for Trace #37 against Core #259 / release #161.
# Software contract suites always run; live production RPC probe is optional (needs .env).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CORE_SHA="c89c538c83eeefcd116c67f06bf86869ff63b2e3"
CORE_RELEASE=161
CORE_RUN_ID=34188983863
HEAD_SHA="$(git rev-parse HEAD)"
RUNTIME_BLOCKER=""

echo "=== Trace Core authority recertification (production-bound) ==="
echo "Trace HEAD: ${HEAD_SHA}"
echo "Core #259 merge SHA: ${CORE_SHA}"
echo "Core production release: #${CORE_RELEASE} (run ${CORE_RUN_ID})"
echo ""

echo ">> verify Core production migration release"
RELEASE_JSON="$(gh api "repos/oasisbaklawa2006/oasis-supabase-core/actions/runs/${CORE_RUN_ID}" \
  --jq '{status, conclusion, head_sha}')"
RELEASE_STATUS="$(printf '%s' "$RELEASE_JSON" | jq -r .status)"
RELEASE_CONCLUSION="$(printf '%s' "$RELEASE_JSON" | jq -r .conclusion)"
RELEASE_HEAD="$(printf '%s' "$RELEASE_JSON" | jq -r .head_sha)"
if [[ "$RELEASE_STATUS" != "completed" || "$RELEASE_CONCLUSION" != "success" ]]; then
  echo "BLOCKED: Core production release #${CORE_RELEASE} run ${CORE_RUN_ID} is ${RELEASE_STATUS}/${RELEASE_CONCLUSION}"
  exit 1
fi
if [[ "$RELEASE_HEAD" != "$CORE_SHA" ]]; then
  echo "BLOCKED: Core release head ${RELEASE_HEAD} does not match expected ${CORE_SHA}"
  exit 1
fi
echo "Core #${CORE_RELEASE} SUCCESS on exact merge SHA."

echo ""
echo ">> authority contract suites (identity, handover, audit, finalize, external_ref, scan/offline)"
npm test -- \
  src/lib/coreTraceAuthorityContract.test.ts \
  src/lib/coreTraceAuthorityNegative.test.ts \
  src/lib/traceAuthorityContract.test.ts \
  src/lib/productionCreate.test.ts \
  src/lib/productionIdentity.test.ts \
  src/lib/handoverEvidence.test.ts \
  src/lib/cartonSeal.test.ts \
  src/lib/idempotentAudit.test.ts \
  src/lib/externalRefSync.test.ts \
  src/lib/scanSubmitQueue.test.ts \
  src/lib/centralTraceContract.test.ts \
  src/lib/centralSubmit.test.ts \
  src/lib/scanContract.test.ts \
  src/lib/legacyGateHandoff.test.ts

echo ""
echo ">> full unit/integration suite"
npm test

echo ">> typecheck"
npm run typecheck

echo ">> lint"
npm run lint

echo ">> build"
npm run build

echo ">> repo boundaries"
npm run check:boundaries

echo ">> Core backend authority (vs main)"
bash scripts/check-core-backend-authority.sh origin/main

echo ""
echo ">> optional production RPC presence probe"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a && source .env && set +a
fi
SUPABASE_URL="${VITE_SUPABASE_URL:-}"
SUPABASE_KEY="${VITE_SUPABASE_ANON_KEY:-}"
if [[ -n "$SUPABASE_URL" && -n "$SUPABASE_KEY" ]]; then
  node --input-type=module -e "
    import { createClient } from '@supabase/supabase-js';
    const rpcs = [
      'trace_allocate_identity_v1',
      'trace_create_production_v1',
      'trace_sign_handover_evidence_v1',
      'trace_verify_handover_evidence_v1',
      'trace_insert_handover_audit_v1',
      'trace_finalize_carton_v1',
      'trace_reconcile_external_refs_v1',
    ];
    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const missing = [];
    for (const fn of rpcs) {
      const { error } = await sb.rpc(fn, fn === 'trace_allocate_identity_v1' ? { p_kind: 'batch' } : {});
      const msg = String(error?.message || '');
      if (msg.includes('does not exist') || msg.includes('Could not find the function')) {
        missing.push(fn);
      }
    }
    if (missing.length) {
      console.error('Production RPC probe missing:', missing.join(', '));
      process.exit(2);
    }
    console.log('Production RPC probe: all Core #259 surfaces reachable (auth/validation errors expected).');
  " || RUNTIME_BLOCKER="production_rpc_probe_failed"
else
  RUNTIME_BLOCKER="production_runtime_verification_requires_VITE_SUPABASE_URL_and_VITE_SUPABASE_ANON_KEY"
  echo "SKIP: no production Supabase credentials in environment (.env not configured in this runner)."
fi

echo ""
echo "=== Recertification summary (Trace HEAD ${HEAD_SHA}) ==="
echo "Core migration: DEPLOYED (#${CORE_RELEASE} SUCCESS on ${CORE_SHA})"
echo "Software contract suites: PASS"
if [[ -n "$RUNTIME_BLOCKER" ]]; then
  echo "Production runtime semantic verification: BLOCKED — ${RUNTIME_BLOCKER}"
  echo "Trace #37 remains DRAFT. Physical scanner/printer/TV/custody evidence: unclaimed (Leap13 / #462)."
  exit 0
fi
echo "Production runtime semantic verification: PASS (RPC presence probe)"
echo "Trace #37 remains DRAFT until review-clean. Physical evidence: unclaimed (Leap13 / #462)."
