import { describe, expect, it } from "vitest";
import {
  CORE_TRACE_AUTHORITY_CERTIFICATION,
  CORE_TRACE_AUTHORITY_MERGE_SHA,
  CORE_TRACE_AUTHORITY_MIGRATION,
  CORE_TRACE_AUTHORITY_PR,
  CORE_TRACE_AUTHORITY_RPCS,
  CORE_TRACE_HANDOVER_ACTIONS,
  CORE_TRACE_IDENTITY_KINDS,
  CORE_TRACE_PRODUCTION_HEAD_RELEASE_RUN_ID,
  CORE_TRACE_PRODUCTION_HEAD_SHA,
  CORE_TRACE_REPRINT_APPROVAL_MERGE_SHA,
  CORE_TRACE_REPRINT_APPROVAL_MIGRATION,
  CORE_TRACE_REPRINT_APPROVAL_PR,
  TRACE_RECOVERY_PR,
} from "./coreTraceAuthorityContract";

describe("coreTraceAuthorityContract", () => {
  it("pins Core #259 merge SHA and migration for recertification", () => {
    expect(CORE_TRACE_AUTHORITY_PR).toBe(259);
    expect(CORE_TRACE_AUTHORITY_MERGE_SHA).toBe("c89c538c83eeefcd116c67f06bf86869ff63b2e3");
    expect(CORE_TRACE_AUTHORITY_MIGRATION).toBe(
      "20260908010000_macro_trace_identity_handover_authority.sql",
    );
  });

  it("pins Core #300 reprint approval dependency for Trace #38", () => {
    expect(CORE_TRACE_REPRINT_APPROVAL_PR).toBe(300);
    expect(CORE_TRACE_REPRINT_APPROVAL_MERGE_SHA).toBe("4e8374eeaad9b9e4e89a0971c14d26b87bc184fb");
    expect(CORE_TRACE_REPRINT_APPROVAL_MIGRATION).toBe(
      "20260915200000_trace_reprint_approval_authority.sql",
    );
    expect(TRACE_RECOVERY_PR).toBe(38);
    expect(CORE_TRACE_PRODUCTION_HEAD_SHA).toBe("6867b432957c79f333dab1ab16afc512623decd9");
    expect(CORE_TRACE_PRODUCTION_HEAD_RELEASE_RUN_ID).toBe(35423092767);
  });

  it("lists governed RPC surfaces consumed by Trace live paths", () => {
    expect(CORE_TRACE_AUTHORITY_RPCS.allocateIdentity).toBe("trace_allocate_identity_v1");
    expect(CORE_TRACE_AUTHORITY_RPCS.createProduction).toBe("trace_create_production_v1");
    expect(CORE_TRACE_AUTHORITY_RPCS.signHandoverEvidence).toBe("trace_sign_handover_evidence_v1");
    expect(CORE_TRACE_AUTHORITY_RPCS.verifyHandoverEvidence).toBe("trace_verify_handover_evidence_v1");
    expect(CORE_TRACE_AUTHORITY_RPCS.insertHandoverAudit).toBe("trace_insert_handover_audit_v1");
    expect(CORE_TRACE_AUTHORITY_RPCS.finalizeCarton).toBe("trace_finalize_carton_v1");
    expect(CORE_TRACE_AUTHORITY_RPCS.approveReprintRequest).toBe("trace_approve_reprint_request_v1");
    expect(CORE_TRACE_HANDOVER_ACTIONS.cartonFinalized).toBe("trace_carton_finalized");
  });

  it("records production migration deployment after Core release #161", () => {
    expect(CORE_TRACE_AUTHORITY_CERTIFICATION.status).toBe("production_migration_deployed");
    expect(CORE_TRACE_AUTHORITY_CERTIFICATION.productionRelease).toBe(161);
    expect(CORE_TRACE_AUTHORITY_CERTIFICATION.productionReleaseRunId).toBe(34188983863);
    expect(CORE_TRACE_AUTHORITY_CERTIFICATION.coreMergeSha).toBe(CORE_TRACE_AUTHORITY_MERGE_SHA);
  });

  it("accepts only Core identity kinds for trace_allocate_identity_v1", () => {
    expect(CORE_TRACE_IDENTITY_KINDS).toEqual([
      "production_label",
      "batch",
      "legacy_carton",
      "dpl",
      "pi",
      "shipping",
    ]);
  });
});
