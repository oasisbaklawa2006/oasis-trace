#!/usr/bin/env bash
# Production-bound recertification for Trace #38 against Core #259 + #300.
# Software contract suites always run; live production RPC probe is optional (needs .env).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CORE_MACRO_SHA="c89c538c83eeefcd116c67f06bf86869ff63b2e3"
CORE_MACRO_RELEASE=161
CORE_MACRO_RUN_ID=34188983863
CORE_REPRINT_SHA="4e8374eeaad9b9e4e89a0971c14d26b87bc184fb"
CORE_PRODUCTION_HEAD="6867b432957c79f333dab1ab16afc512623decd9"
CORE_PRODUCTION_HEAD_RUN_ID=35423092767
HEAD_SHA="$(git rev-parse HEAD)"
RUNTIME_BLOCKER=""

echo "=== Trace Core authority recertification (production-bound) ==="
echo "Trace HEAD: ${HEAD_SHA}"
echo "Core #259 merge SHA: ${CORE_MACRO_SHA}"
echo "Core #300 merge SHA: ${CORE_REPRINT_SHA}"
echo "Core production head: ${CORE_PRODUCTION_HEAD} (run ${CORE_PRODUCTION_HEAD_RUN_ID})"
echo ""

echo ">> verify Core macro production migration release (#259 / #161)"
RELEASE_JSON="$(gh api "repos/oasisbaklawa2006/oasis-supabase-core/actions/runs/${CORE_MACRO_RUN_ID}" \
  --jq '{status, conclusion, head_sha}')"
RELEASE_STATUS="$(printf '%s' "$RELEASE_JSON" | jq -r .status)"
RELEASE_CONCLUSION="$(printf '%s' "$RELEASE_JSON" | jq -r .conclusion)"
RELEASE_HEAD="$(printf '%s' "$RELEASE_JSON" | jq -r .head_sha)"
if [[ "$RELEASE_STATUS" != "completed" || "$RELEASE_CONCLUSION" != "success" ]]; then
  echo "BLOCKED: Core production release #${CORE_MACRO_RELEASE} run ${CORE_MACRO_RUN_ID} is ${RELEASE_STATUS}/${RELEASE_CONCLUSION}"
  exit 1
fi
if [[ "$RELEASE_HEAD" != "$CORE_MACRO_SHA" ]]; then
  echo "BLOCKED: Core macro release head ${RELEASE_HEAD} does not match expected ${CORE_MACRO_SHA}"
  exit 1
fi
echo "Core #${CORE_MACRO_RELEASE} SUCCESS on exact #259 merge SHA."

echo ""
echo ">> verify latest Core production head release (includes #300 reprint approval)"
HEAD_RELEASE_JSON="$(gh api "repos/oasisbaklawa2006/oasis-supabase-core/actions/runs/${CORE_PRODUCTION_HEAD_RUN_ID}" \
  --jq '{status, conclusion, head_sha}')"
HEAD_STATUS="$(printf '%s' "$HEAD_RELEASE_JSON" | jq -r .status)"
HEAD_CONCLUSION="$(printf '%s' "$HEAD_RELEASE_JSON" | jq -r .conclusion)"
HEAD_RELEASE_HEAD="$(printf '%s' "$HEAD_RELEASE_JSON" | jq -r .head_sha)"
if [[ "$HEAD_STATUS" != "completed" || "$HEAD_CONCLUSION" != "success" ]]; then
  echo "BLOCKED: Core production head run ${CORE_PRODUCTION_HEAD_RUN_ID} is ${HEAD_STATUS}/${HEAD_CONCLUSION}"
  exit 1
fi
if [[ "$HEAD_RELEASE_HEAD" != "$CORE_PRODUCTION_HEAD" ]]; then
  echo "BLOCKED: Core production head ${HEAD_RELEASE_HEAD} does not match expected ${CORE_PRODUCTION_HEAD}"
  exit 1
fi
echo "Core production head SUCCESS on ${CORE_PRODUCTION_HEAD}."

echo ""
echo ">> verify Core production head contains #300 reprint approval commit"
COMPARE_STATUS="$(gh api "repos/oasisbaklawa2006/oasis-supabase-core/compare/${CORE_REPRINT_SHA}...${CORE_PRODUCTION_HEAD}" --jq '.status')"
if [[ "$COMPARE_STATUS" != "ahead" && "$COMPARE_STATUS" != "identical" ]]; then
  echo "BLOCKED: Core production head ${CORE_PRODUCTION_HEAD} does not contain #300 merge ${CORE_REPRINT_SHA} (compare status: ${COMPARE_STATUS})"
  exit 1
fi
echo "Core production head contains #300 reprint approval (${COMPARE_STATUS})."

echo ""
echo ">> authority contract suites (identity, handover, reprint, device surfaces, scan/offline)"
npm test -- \
  src/lib/coreTraceAuthorityContract.test.ts \
  src/lib/coreTraceAuthorityNegative.test.ts \
  src/lib/traceAuthorityContract.test.ts \
  src/lib/productionCreate.test.ts \
  src/lib/productionIdentity.test.ts \
  src/lib/handoverEvidence.test.ts \
  src/lib/cartonSeal.test.ts \
  src/lib/cartonIndex.test.ts \
  src/lib/idempotentAudit.test.ts \
  src/lib/externalRefSync.test.ts \
  src/lib/scanSubmitQueue.test.ts \
  src/lib/centralTraceContract.test.ts \
  src/lib/centralSubmit.test.ts \
  src/lib/scanContract.test.ts \
  src/lib/legacyGateHandoff.test.ts \
  src/lib/governedPrint.test.ts \
  src/lib/atomicGovernedReprint.test.ts \
  src/lib/reprintPolicyLiveApproval.test.ts \
  src/lib/deviceSurfaceContract.test.ts \
  src/lib/deviceSurfaceRuntimePolicy.test.ts

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
      'trace_add_carton_content_v1',
      'trace_allocate_carton_index_v1',
      'trace_legacy_gate_clear_v1',
      'trace_record_gate_scan_v1',
      'trace_approve_reprint_request_v1',
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
    console.log('Production RPC probe: all Core #259/#300 surfaces reachable (auth/validation errors expected).');
  " || RUNTIME_BLOCKER="production_rpc_probe_failed"
else
  RUNTIME_BLOCKER="production_runtime_verification_requires_VITE_SUPABASE_URL_and_VITE_SUPABASE_ANON_KEY"
  echo "SKIP: no production Supabase credentials in environment (.env not configured in this runner)."
fi

echo ""
echo "=== Recertification summary (Trace HEAD ${HEAD_SHA}) ==="
echo "Core macro migration (#259): DEPLOYED (#${CORE_MACRO_RELEASE} SUCCESS on ${CORE_MACRO_SHA})"
echo "Core reprint approval (#300): DEPLOYED via production head ${CORE_PRODUCTION_HEAD}"
echo "Software contract suites: PASS"
if [[ -n "$RUNTIME_BLOCKER" ]]; then
  echo "Production runtime semantic verification: BLOCKED — ${RUNTIME_BLOCKER}"
  echo "Physical scanner/printer/TV/custody evidence: PHYSICAL_CERTIFICATION_REQUIRED (Leap13 / #462)."
  exit 0
fi
echo "Production runtime semantic verification: PASS (RPC presence probe)"
echo "Physical scanner/printer/TV/custody evidence: PHYSICAL_CERTIFICATION_REQUIRED (Leap13 / #462)."
