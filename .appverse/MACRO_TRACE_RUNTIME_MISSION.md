# MACRO TRACE RUNTIME COMPLETION — Central #554 Leap 8

## Mission
Complete the remaining Oasis Trace software/server journey as one macro tranche. Reuse merged Point93 authority and absorb useful open Point92/94/96 work; do not create point-by-point micro PRs.

## Substantive scope
- complete Central↔Trace server authority and canonical contract binding
- deterministic `external_ref` synchronization and reconciliation
- governed central scan submission/validation with tenant and role isolation
- barcode identity, label generation, print/reprint/verify software paths
- signed scan provenance and immutable handover evidence
- offline queue, retry, replay, idempotency and duplicate prevention
- production/packing/dispatch/security-gate handover and proof binding
- PC/mobile/handheld/TV role-appropriate surfaces
- eliminate mocks/shadow server authority where canonical Core/Central contracts exist
- add integration and regression coverage for every repaired invariant

## Execution rules
1. Batch implementation and review repairs in this macro PR; no one-line repair PRs.
2. Preserve merged Point93 producer/consumer behavior and reuse existing barcode/offline/device work where sound.
3. Do not fabricate physical device evidence. Real scanner, printer, handheld, TV and network-loss replay remain Central #554 Leap13.
4. Build all software/runtime paths that can be validated without physical hardware now.
5. Cross-repo Central changes are coordinated through Central #557 and should be absorbed into active Central macro integration rather than shadow authority here.
6. Run exact-head unit/integration/build/lint/ownership/security/review gates and browser/device-fixture tests available in repo.
7. Keep draft until the substantial software/server tranche is materially complete and exact-head clean.

## Exit
Trace software and server integration is deployable with complete automated evidence, with only explicitly enumerated physical/provider gates deferred.