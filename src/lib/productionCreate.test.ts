import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionWithAuthoritativeIds } from "./productionCreate";

const { invokeTraceMutation } = vi.hoisted(() => ({
  invokeTraceMutation: vi.fn(),
}));

const supabaseConfigured = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/data", () => ({
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

const batchInput = {
  product_id: "prod-1",
  department_id: "dept-1",
  shift: "A",
  mfg_date: "2026-09-07",
  shelf_life_days: 90,
  qc_status: "pending",
  remarks: "",
};

const labelInput = {
  product_id: "prod-1",
  department_id: "dept-1",
  tray_serial: "T-1",
  net_weight: 5,
  gross_weight: 5.25,
  mfg_date: "2026-09-07",
  best_before: "2026-12-06",
  qc_status: "pending",
  operator_name: "Ali",
  status: "active",
  metadata: { product_name: "Baklawa" },
};

describe("createProductionWithAuthoritativeIds", () => {
  beforeEach(() => {
    invokeTraceMutation.mockReset();
    supabaseConfigured.value = false;
    localStorage.clear();
  });

  it("routes live production create through Core without client batch_no or label_no", async () => {
    supabaseConfigured.value = true;
    const serverBatch = {
      id: "batch-core-1",
      batch_no: "BAT-20260907-001",
      ...batchInput,
    };
    const serverLabels = [{
      id: "label-core-1",
      label_no: "PL-20260907-0001",
      batch_id: "batch-core-1",
      batch_no: "BAT-20260907-001",
      ...labelInput,
    }];
    invokeTraceMutation.mockResolvedValue({ batch: serverBatch, labels: serverLabels });

    const result = await createProductionWithAuthoritativeIds(
      batchInput,
      [labelInput],
      "create-production:req-1",
    );

    expect(result.batch.batch_no).toBe("BAT-20260907-001");
    expect(result.labels[0].label_no).toBe("PL-20260907-0001");
    expect(invokeTraceMutation).toHaveBeenCalledWith("trace_create_production_v1", {
      p_input: batchInput,
      p_labels: [labelInput],
      p_idempotency_key: "create-production:req-1",
    });
    expect(invokeTraceMutation).not.toHaveBeenCalledWith("trace_allocate_identity_v1", expect.anything());
  });

  it("rejects live responses missing authoritative identifiers", async () => {
    supabaseConfigured.value = true;
    invokeTraceMutation.mockResolvedValue({
      batch: { id: "batch-1" },
      labels: [{ id: "label-1", label_no: "" }],
    });
    await expect(
      createProductionWithAuthoritativeIds(batchInput, [labelInput], "create-production:req-2"),
    ).rejects.toThrow(/authoritative/i);
  });

  it("allocates demo identifiers locally when Supabase is not configured", async () => {
    const result = await createProductionWithAuthoritativeIds(
      batchInput,
      [labelInput],
      "create-production:demo-1",
    );
    expect(result.batch.batch_no).toMatch(/^BAT-/);
    expect(result.labels[0].label_no).toMatch(/^PL-/);
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });
});
