#!/usr/bin/env bash
# Leap13 physical-device UAT runner — software preflight + operator checklist hooks.
# Does NOT fabricate hardware evidence. Enable capture hooks with VITE_LEAP13_UAT=1.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "=== MACRO TRACE Leap13 UAT — software preflight ==="
npm run typecheck
npm run lint
npm test
npm run build
npm run check:boundaries
bash scripts/check-core-backend-authority.sh "$(git merge-base HEAD origin/main)"

echo ""
echo "=== Automated software gates passed ==="
echo "Enable browser evidence capture: VITE_LEAP13_UAT=1 npm run dev"
echo "Or append ?leap13_uat=1 to any Trace route."
echo ""
echo "Operator scenarios (physical evidence required — do not claim pass without device proof):"
echo "  1. scripts/uat/leap13-gate-handheld.sh"
echo "  2. scripts/uat/leap13-packing-carton.sh"
echo "  3. scripts/uat/leap13-tv-kiosks.sh"
echo "  4. scripts/uat/leap13-offline-replay.sh"
echo ""
echo "Export captured hooks from browser console:"
echo "  import { exportLeap13EvidenceJson } from '/src/lib/leap13Evidence.ts'"
echo "  // or: localStorage.getItem('ols_leap13_evidence_v1')"
