import { describe, expect, it, vi, beforeEach } from "vitest";
import { num } from "./numbering";

const supabaseConfigured = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() {
    return supabaseConfigured.value;
  },
}));

describe("numbering", () => {
  beforeEach(() => {
    supabaseConfigured.value = false;
  });

  it("returns static preview placeholders in configured live mode", () => {
    supabaseConfigured.value = true;
    expect(num.batch()).toBe("BAT-PREVIEW-001");
    expect(num.productionLabel()).toBe("PL-PREVIEW-0001");
    expect(num.carton()).toBe("CTN-PREVIEW-0001");
  });
});
