// Client for the local print bridge -- exercises the fetch contract only
// (the actual TCP forwarding lives in scripts/print-bridge.mjs and is
// covered by printBridgeServer.test.ts against a real socket).
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendToPrintBridge, checkPrintBridgeHealth } from "./printBridge";

const target = { bridgeUrl: "http://127.0.0.1:9191", host: "192.168.1.50", port: 9100 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendToPrintBridge", () => {
  it("posts host/port/data to <bridgeUrl>/print", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, message: "Sent 42 bytes to 192.168.1.50:9100" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendToPrintBridge(target, "^XA^XZ");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9191/print", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "192.168.1.50", port: 9100, data: "^XA^XZ" }),
    }));
    expect(result).toEqual({ ok: true, message: "Sent 42 bytes to 192.168.1.50:9100" });
  });

  it("strips a trailing slash from the bridge URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, message: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);
    await sendToPrintBridge({ ...target, bridgeUrl: "http://127.0.0.1:9191/" }, "data");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9191/print", expect.anything());
  });

  it("returns a friendly message when the bridge is unreachable (fetch throws)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await sendToPrintBridge(target, "data");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/print bridge/i);
  });

  it("surfaces the bridge's own error message when the printer is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ ok: false, message: "Could not reach printer at 192.168.1.50:9100 (ETIMEDOUT)" }),
    }));
    const result = await sendToPrintBridge(target, "data");
    expect(result).toEqual({ ok: false, message: "Could not reach printer at 192.168.1.50:9100 (ETIMEDOUT)" });
  });

  it("rejects locally without a network call when configuration is incomplete", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await sendToPrintBridge({ ...target, bridgeUrl: "" }, "data")).ok).toBe(false);
    expect((await sendToPrintBridge({ ...target, host: "" }, "data")).ok).toBe(false);
    expect((await sendToPrintBridge({ ...target, port: 0 }, "data")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("checkPrintBridgeHealth", () => {
  it("returns true when GET /health responds ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await checkPrintBridgeHealth("http://127.0.0.1:9191")).toBe(true);
  });
  it("returns false when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));
    expect(await checkPrintBridgeHealth("http://127.0.0.1:9191")).toBe(false);
  });
  it("returns false for an empty URL without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkPrintBridgeHealth("")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
