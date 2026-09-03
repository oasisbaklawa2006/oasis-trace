import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import type { CentralSubmitResult } from "@/lib/centralSubmit";
import { usePendingCentralSubmitSync } from "./usePendingCentralSubmitSync";

const emitResolution = vi.fn();

vi.mock("@/lib/scanSubmitQueue", () => ({
  subscribeScanSubmitResolution: (listener: (key: string, result: CentralSubmitResult) => void) => {
    emitResolution.mockImplementation(listener);
    return () => emitResolution.mockReset();
  },
}));

describe("usePendingCentralSubmitSync", () => {
  it("updates retry_pending submitResult when background replay resolves", () => {
    const { result } = renderHook(() => {
      const [submitResult, setSubmitResult] = useState<CentralSubmitResult | null>({
        ok: false,
        status: "retry_pending",
        message: "Queued",
      });
      usePendingCentralSubmitSync("k-sync", setSubmitResult);
      return submitResult;
    });

    expect(result.current?.status).toBe("retry_pending");

    act(() => {
      emitResolution("k-sync", {
        ok: true,
        status: "submitted",
        message: "Submitted to Central",
        centralReference: "CENTRAL-1",
      });
    });

    expect(result.current?.status).toBe("submitted");
    expect(result.current?.centralReference).toBe("CENTRAL-1");
  });

  it("ignores resolution for a different idempotency key", () => {
    const { result } = renderHook(() => {
      const [submitResult, setSubmitResult] = useState<CentralSubmitResult | null>({
        ok: false,
        status: "retry_pending",
        message: "Queued",
      });
      usePendingCentralSubmitSync("k-sync", setSubmitResult);
      return submitResult;
    });

    act(() => {
      emitResolution("k-other", {
        ok: true,
        status: "submitted",
        message: "Submitted",
      });
    });

    expect(result.current?.status).toBe("retry_pending");
  });
});
