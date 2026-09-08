import { demo } from "@/lib/demoStore";
import { num } from "@/lib/numbering";
import { traceMutations } from "@/lib/traceMutations";
import { supabaseConfigured } from "@/lib/supabase";
import type { ProductionBatch, ProductionLabel } from "@/lib/types";

export interface CreateProductionBatchInput {
  product_id: string;
  department_id: string;
  shift: string;
  mfg_date: string;
  shelf_life_days: number;
  qc_status: string;
  remarks?: string;
}

export interface CreateProductionLabelInput {
  product_id: string;
  department_id: string;
  tray_serial: string;
  net_weight: number;
  gross_weight: number;
  mfg_date: string;
  best_before: string;
  qc_status: string;
  operator_name?: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProductionResult {
  batch: ProductionBatch;
  labels: ProductionLabel[];
}

function assertAuthoritativeProductionResult(result: CreateProductionResult): CreateProductionResult {
  const { batch, labels } = result;
  if (!batch?.id || !batch.batch_no) {
    throw new Error(
      "Invalid production create response: authoritative batch_no required from trace_create_production_v1.",
    );
  }
  if (!labels?.length || labels.some(label => !label.id || !label.label_no)) {
    throw new Error(
      "Invalid production create response: authoritative label_no required for every label from trace_create_production_v1.",
    );
  }
  return result;
}

async function demoCreateProduction(
  batchInput: CreateProductionBatchInput,
  labelInputs: CreateProductionLabelInput[],
): Promise<CreateProductionResult> {
  const batchNo = num.batch();
  const batch = demo.insert("ols_production_batches", {
    ...batchInput,
    batch_no: batchNo,
  }) as ProductionBatch;
  const labels = labelInputs.map((input) => {
    const labelNo = num.productionLabel();
    return demo.insert("ols_production_labels", {
      ...input,
      label_no: labelNo,
      batch_id: batch.id,
      batch_no: batchNo,
    }) as unknown as ProductionLabel;
  });
  return { batch, labels };
}

/**
 * Create a production batch and labels.
 * Live: identifiers are assigned atomically by trace_create_production_v1 (no client batch_no/label_no).
 * Demo/preview: local allocator only.
 */
export async function createProductionWithAuthoritativeIds(
  batchInput: CreateProductionBatchInput,
  labelInputs: CreateProductionLabelInput[],
  idempotencyKey: string,
): Promise<CreateProductionResult> {
  if (!supabaseConfigured) {
    return demoCreateProduction(batchInput, labelInputs);
  }

  const result = await traceMutations.createProduction(
    batchInput as unknown as Record<string, unknown>,
    labelInputs as unknown as Record<string, unknown>[],
    idempotencyKey,
  );
  return assertAuthoritativeProductionResult(result);
}
