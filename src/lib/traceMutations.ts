import { invokeTraceMutation } from "@/lib/data";
import type { HandoverEvidence } from "@/lib/handoverEvidence";
import type { Carton, CartonContent, DplDocument, FinancePi, PrinterRow, ProductionBatch, ProductionLabel, ShippingLabelRow } from "@/lib/types";

export interface ProductionMutationResult { batch: ProductionBatch; labels: ProductionLabel[] }
export interface PiCartonMutationResult { pi: FinancePi; carton: Carton; link_id: string }

export const traceMutations = {
  createProduction: (input: Record<string, unknown>, labels: Record<string, unknown>[], idempotencyKey: string) =>
    invokeTraceMutation<ProductionMutationResult>("trace_create_production_v1", { p_input: input, p_labels: labels, p_idempotency_key: idempotencyKey }),
  finalizeCarton: (
    cartonId: string,
    net: number,
    gross: number,
    copied: boolean,
    idempotencyKey: string,
    opts?: { handoverEvidence?: HandoverEvidence; actorId?: string },
  ) =>
    invokeTraceMutation<Carton>("trace_finalize_carton_v1", {
      p_carton_id: cartonId,
      p_net_weight: net,
      p_gross_weight: gross,
      p_copied_to_clipboard: copied,
      p_idempotency_key: idempotencyKey,
      p_handover_evidence: opts?.handoverEvidence ?? null,
      p_actor_id: opts?.actorId ?? null,
    }),
  addCartonContent: (cartonId: string, labelId: string, idempotencyKey: string) =>
    invokeTraceMutation<CartonContent>("trace_add_carton_content_v1", {
      p_carton_id: cartonId,
      p_production_label_id: labelId,
      p_idempotency_key: idempotencyKey,
    }),
  createDpl: (input: Record<string, unknown>, cartonIds: string[], idempotencyKey: string) =>
    invokeTraceMutation<{ dpl: DplDocument; links: Array<{ id: string; dpl_id: string; carton_id: string; position: number }> }>("trace_create_dpl_v1", { p_input: input, p_carton_ids: cartonIds, p_idempotency_key: idempotencyKey }),
  addCartonToPi: (cartonId: string, piId: string | null, piNo: string, idempotencyKey: string) =>
    invokeTraceMutation<PiCartonMutationResult>("trace_add_carton_to_pi_v1", { p_carton_id: cartonId, p_pi_id: piId, p_pi_no: piNo, p_idempotency_key: idempotencyKey }),
  clearPi: (piId: string, invoiceRef: string, lines: Record<string, unknown>[], idempotencyKey: string) =>
    invokeTraceMutation<FinancePi>("trace_clear_pi_v1", { p_pi_id: piId, p_invoice_ref: invoiceRef, p_lines: lines, p_idempotency_key: idempotencyKey }),
  createShippingLabel: (input: Record<string, unknown>, idempotencyKey: string) =>
    invokeTraceMutation<ShippingLabelRow>("trace_create_shipping_label_v1", { p_input: input, p_idempotency_key: idempotencyKey }),
  savePrinterSettings: (printerId: string, settings: Record<string, unknown>) =>
    invokeTraceMutation<PrinterRow>("trace_save_printer_settings_v1", {
      p_printer_id: printerId,
      p_settings: settings,
    }),
  reconcileExternalRefs: () =>
    invokeTraceMutation<{ bindings?: Array<{ cache_id: string; external_ref: string }>; applied?: number }>(
      "trace_reconcile_external_refs_v1",
      {},
    ),
  legacyGateClear: (qrRef: string, shippingLabelId: string, cartonId: string, idempotencyKey: string) =>
    invokeTraceMutation("trace_legacy_gate_clear_v1", {
      p_qr_ref: qrRef,
      p_shipping_label_id: shippingLabelId,
      p_carton_id: cartonId,
      p_idempotency_key: idempotencyKey,
    }),
  signHandoverEvidence: (input: {
    stage: string;
    entityType: string;
    entityId: string;
    referenceNo: string;
    metadata: Record<string, unknown>;
    actorId?: string;
    priorHash?: string;
  }) =>
    invokeTraceMutation<HandoverEvidence>("trace_sign_handover_evidence_v1", {
      p_stage: input.stage,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId,
      p_reference_no: input.referenceNo,
      p_metadata: input.metadata,
      p_actor_id: input.actorId ?? null,
      p_prior_hash: input.priorHash ?? null,
    }),
  insertHandoverAudit: (
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>,
    idempotencyKey: string,
  ) =>
    invokeTraceMutation("trace_insert_handover_audit_v1", {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_details: details,
      p_idempotency_key: idempotencyKey,
    }),
  verifyHandoverEvidence: (
    evidence: HandoverEvidence,
    opts?: { priorHash?: string; expectedAction?: string; enforceConsumption?: boolean },
  ) =>
    invokeTraceMutation<boolean>("trace_verify_handover_evidence_v1", {
      p_evidence: evidence,
      p_prior_hash: opts?.priorHash ?? null,
      p_expected_action: opts?.expectedAction ?? null,
      p_enforce_consumption: opts?.enforceConsumption ?? false,
    }),
};
