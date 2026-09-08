/**
 * Core #259 — Trace authority RPC contract (consumer binding).
 *
 * Canonical producer: oasis-supabase-core @ c89c538c83eeefcd116c67f06bf86869ff63b2e3
 * Migration: 20260908010000_macro_trace_identity_handover_authority.sql
 * Production Migration Release #161: SUCCESS on exact merge SHA (run 34188983863).
 *
 * Demo/preview client allocation and software_chain_v1 hashes are never live-accepted.
 * `production_runtime_verified` requires authenticated production Supabase semantic checks.
 */

/** Core merge SHA for MACRO-TRACE-CORE #259 — bind recertification to this exact head. */
export const CORE_TRACE_AUTHORITY_MERGE_SHA = "c89c538c83eeefcd116c67f06bf86869ff63b2e3";

export const CORE_TRACE_AUTHORITY_MIGRATION = "20260908010000_macro_trace_identity_handover_authority.sql";

/** Core PR that delivered these RPCs (oasis-supabase-core). */
export const CORE_TRACE_AUTHORITY_PR = 259;

/** Protected Production Migration Release that deployed #259 to production. */
export const CORE_TRACE_PRODUCTION_RELEASE = 161;

/** GitHub Actions run id for successful production deployment on merge SHA. */
export const CORE_TRACE_PRODUCTION_RELEASE_RUN_ID = 34188983863;

/** Governed RPC surfaces consumed by Trace live paths. */
export const CORE_TRACE_AUTHORITY_RPCS = {
  allocateIdentity: "trace_allocate_identity_v1",
  createProduction: "trace_create_production_v1",
  signHandoverEvidence: "trace_sign_handover_evidence_v1",
  verifyHandoverEvidence: "trace_verify_handover_evidence_v1",
  insertHandoverAudit: "trace_insert_handover_audit_v1",
  finalizeCarton: "trace_finalize_carton_v1",
  reconcileExternalRefs: "trace_reconcile_external_refs_v1",
  addCartonContent: "trace_add_carton_content_v1",
  allocateCartonIndex: "trace_allocate_carton_index_v1",
  legacyGateClear: "trace_legacy_gate_clear_v1",
} as const;

/** Core audit/mutation action names used by enforce_consumption verification. */
export const CORE_TRACE_HANDOVER_ACTIONS = {
  cartonFinalized: "trace_carton_finalized",
  productionCreated: "trace_production_created",
} as const;

export type CoreTraceAuthorityRpc = typeof CORE_TRACE_AUTHORITY_RPCS[keyof typeof CORE_TRACE_AUTHORITY_RPCS];

/** Trace allocatable kinds accepted by trace_allocate_identity_v1. */
export const CORE_TRACE_IDENTITY_KINDS = [
  "production_label",
  "batch",
  "legacy_carton",
  "dpl",
  "pi",
  "shipping",
] as const;

/**
 * Production authority certification state for Trace #37 recertification lane.
 * - production_migration_deployed: Core #161 succeeded on merge SHA (schema/RPC deployed).
 * - production_runtime_verified: authenticated production Supabase semantic checks passed.
 */
export type CoreTraceAuthorityCertificationStatus =
  | "pending_production_migration"
  | "production_migration_deployed"
  | "production_runtime_verified";

export const CORE_TRACE_AUTHORITY_CERTIFICATION: {
  status: CoreTraceAuthorityCertificationStatus;
  coreMergeSha: string;
  coreMigration: string;
  productionRelease: number;
  productionReleaseRunId: number;
  note: string;
} = {
  status: "production_migration_deployed",
  coreMergeSha: CORE_TRACE_AUTHORITY_MERGE_SHA,
  coreMigration: CORE_TRACE_AUTHORITY_MIGRATION,
  productionRelease: CORE_TRACE_PRODUCTION_RELEASE,
  productionReleaseRunId: CORE_TRACE_PRODUCTION_RELEASE_RUN_ID,
  note:
    "Core #259 deployed via Production Migration Release #161 on c89c538. "
    + "Trace #37 remains draft until production runtime semantic verification and review-clean. "
    + "Physical scanner/printer/TV/custody evidence remains separate (Leap13 / #462).",
};

/** Contract test files exercised by scripts/recertify-core-trace-authority.sh */
export const CORE_TRACE_RECERT_CONTRACT_SUITES = [
  "src/lib/coreTraceAuthorityContract.test.ts",
  "src/lib/coreTraceAuthorityNegative.test.ts",
  "src/lib/traceAuthorityContract.test.ts",
  "src/lib/productionCreate.test.ts",
  "src/lib/productionIdentity.test.ts",
  "src/lib/handoverEvidence.test.ts",
  "src/lib/cartonSeal.test.ts",
  "src/lib/idempotentAudit.test.ts",
  "src/lib/externalRefSync.test.ts",
  "src/lib/scanSubmitQueue.test.ts",
  "src/lib/centralTraceContract.test.ts",
  "src/lib/centralSubmit.test.ts",
] as const;
