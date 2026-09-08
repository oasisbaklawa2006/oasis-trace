/**
 * Core #259 — Trace authority RPC contract (consumer binding).
 *
 * Canonical producer: oasis-supabase-core @ c89c538c83eeefcd116c67f06bf86869ff63b2e3
 * Migration: 20260908010000_macro_trace_identity_handover_authority.sql
 *
 * Production authority is NOT claimed until Protected Production Migration Release
 * #161 succeeds on the exact merge SHA with semantic/runtime verification.
 * Demo/preview client allocation and software_chain_v1 hashes are never live-accepted.
 */

/** Core merge SHA for MACRO-TRACE-CORE #259 — bind recertification to this exact head. */
export const CORE_TRACE_AUTHORITY_MERGE_SHA = "c89c538c83eeefcd116c67f06bf86869ff63b2e3";

export const CORE_TRACE_AUTHORITY_MIGRATION = "20260908010000_macro_trace_identity_handover_authority.sql";

/** Core PR that delivered these RPCs (oasis-supabase-core). */
export const CORE_TRACE_AUTHORITY_PR = 259;

/** Governed RPC surfaces consumed by Trace live paths. */
export const CORE_TRACE_AUTHORITY_RPCS = {
  allocateIdentity: "trace_allocate_identity_v1",
  createProduction: "trace_create_production_v1",
  signHandoverEvidence: "trace_sign_handover_evidence_v1",
  verifyHandoverEvidence: "trace_verify_handover_evidence_v1",
  insertHandoverAudit: "trace_insert_handover_audit_v1",
  finalizeCarton: "trace_finalize_carton_v1",
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
 * Production authority certification state.
 * Remains `pending_production_migration` until Core release #161 is SUCCESS.
 */
export type CoreTraceAuthorityCertificationStatus =
  | "pending_production_migration"
  | "production_certified";

export const CORE_TRACE_AUTHORITY_CERTIFICATION: {
  status: CoreTraceAuthorityCertificationStatus;
  coreMergeSha: string;
  coreMigration: string;
  productionRelease: number;
  note: string;
} = {
  status: "pending_production_migration",
  coreMergeSha: CORE_TRACE_AUTHORITY_MERGE_SHA,
  coreMigration: CORE_TRACE_AUTHORITY_MIGRATION,
  productionRelease: 161,
  note:
    "Trace #37 remains draft. Live Core authority is not claimed until Protected Production "
    + "Migration Release #161 succeeds on the exact merge SHA.",
};
