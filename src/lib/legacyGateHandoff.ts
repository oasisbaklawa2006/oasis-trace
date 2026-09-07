/**
 * Legacy shipping-QR gate handoff — fail-closed client orchestration.
 *
 * Atomic server claim via Core RPC (`trace_legacy_gate_clear_v1`) when live;
 * demo mode uses guarded sequential writes with dispatch-state re-check.
 * Physical scanner UAT remains Leap13.
 */
import { insertRow, invokeTraceMutation, listTable, updateRow } from "@/lib/data";
import { isRpcNotDeployedError } from "@/lib/rpcErrors";
import { supabaseConfigured } from "@/lib/supabase";
import { buildHandoverEvidence } from "@/lib/handoverEvidence";
import { resolvePriorHandoverChainHash } from "@/lib/handoverChain";
import { resolveLegacyGateDecision, type LegacyGateDecision } from "@/lib/scanService";
import type { Carton, FinancePi, ShippingLabelRow } from "@/lib/types";

export interface LegacyGateHandoffInput {
  ref: string;
  shippingLabels: ShippingLabelRow[];
  cartons: Carton[];
  pis: FinancePi[];
  actorId?: string;
}

export interface LegacyGateHandoffResult {
  decision: LegacyGateDecision;
  duplicateDispatch?: boolean;
}

async function recordGateScan(
  ref: string,
  decision: LegacyGateDecision,
): Promise<void> {
  const { result: res, label: lbl } = decision;
  await insertRow("ols_gate_scans", {
    qr_ref: ref,
    shipping_label_id: lbl?.id,
    result: res.kind,
    reason: res.reason,
  });
  await insertRow("ols_scan_history", {
    scan_value: ref,
    scan_context: "gate_shipping_qr",
    result: res.kind,
    metadata: { reason: res.reason || null, legacy_flow: true },
  });
  if (res.kind === "red") {
    await insertRow("ols_audit_logs", {
      action: "gate_hold",
      entity_type: "shipping_label",
      entity_id: lbl?.id,
      details: { qr_ref: ref, reason: res.reason },
    });
  }
}

async function dispatchLegacyGreen(
  ref: string,
  lbl: { id: string; shipping_no: string },
  ctn: { id: string; carton_no: string },
  actorId?: string,
): Promise<void> {
  const priorHash = await resolvePriorHandoverChainHash("carton", ctn.id);
  const evidence = await buildHandoverEvidence(
    "gate",
    "shipping_label",
    lbl.id,
    ctn.carton_no,
    { shipping_no: lbl.shipping_no, qr_ref: ref, result: "green" },
    { actorId, priorHash },
  );
  await updateRow("ols_cartons", ctn.id, { status: "dispatched" });
  await updateRow("ols_shipping_labels", lbl.id, { status: "dispatched" });
  await insertRow("ols_inventory_movements", {
    production_label_id: null,
    from_location: "shipping",
    to_location: "dispatched",
    movement_type: "gate_clear",
    reference_no: ctn.carton_no,
  });
  await insertRow("ols_audit_logs", {
    action: "gate_dispatched",
    entity_type: "shipping_label",
    entity_id: lbl.id,
    details: {
      carton_no: ctn.carton_no,
      shipping_no: lbl.shipping_no,
      qr_ref: ref,
      handover_evidence: evidence,
    },
  });
}

/** Re-read dispatch state before mutating — reduces stale concurrent claims. */
async function isAlreadyDispatched(cartonId: string, labelId: string): Promise<boolean> {
  const [cartons, labels] = await Promise.all([
    listTable<Carton>("ols_cartons"),
    listTable<ShippingLabelRow>("ols_shipping_labels"),
  ]);
  const ctn = cartons.find(c => c.id === cartonId);
  const lbl = labels.find(l => l.id === labelId);
  return ctn?.status === "dispatched" || lbl?.status === "dispatched";
}

export async function executeLegacyGateHandoff(
  input: LegacyGateHandoffInput,
): Promise<LegacyGateHandoffResult> {
  const decision = resolveLegacyGateDecision(input.ref, {
    shippingLabels: input.shippingLabels,
    cartons: input.cartons,
    pis: input.pis,
  });
  const { result: res, label: lbl, carton: ctn } = decision;

  if (res.kind === "green" && ctn && lbl) {
    if (await isAlreadyDispatched(ctn.id, lbl.id)) {
      await recordGateScan(input.ref, decision);
      return { decision, duplicateDispatch: true };
    }

    if (supabaseConfigured) {
      try {
        await invokeTraceMutation("trace_legacy_gate_clear_v1", {
          p_qr_ref: input.ref,
          p_shipping_label_id: lbl.id,
          p_carton_id: ctn.id,
          p_idempotency_key: `legacy-gate:${input.ref}`,
        });
        await recordGateScan(input.ref, decision);
        return { decision };
      } catch (err: unknown) {
        if (!isRpcNotDeployedError(err)) throw err;
      }
    }

    await dispatchLegacyGreen(input.ref, lbl, ctn, input.actorId);
  }

  await recordGateScan(input.ref, decision);
  return { decision };
}
