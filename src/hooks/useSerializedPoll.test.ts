import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSerializedPoll } from "./useSerializedPoll";

describe("useSerializedPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes load on mount and on interval without overlapping in-flight calls", async () => {
    let active = 0;
    let maxActive = 0;
    const load = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 50));
      active -= 1;
    });

    renderHook(() => {
      useSerializedPoll(load, 100);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(maxActive).toBe(1);
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the latest load callback after dependency change", async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});

    const { rerender } = renderHook(
      ({ fn }) => {
        useSerializedPoll(fn, 1000);
      },
      { initialProps: { fn: first } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ fn: second });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(second).toHaveBeenCalled();
  });

  it("contains rejected loads and allows the next tick to run", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("poll failed"))
      .mockResolvedValueOnce(undefined);

    renderHook(() => {
      useSerializedPoll(load, 100);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
