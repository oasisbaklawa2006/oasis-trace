// End-to-end coverage for the standalone print bridge (scripts/print-bridge.mjs)
// against a real TCP socket -- no physical printer available in CI, but this
// proves the actual byte-forwarding path (HTTP -> raw TCP) is correct, which
// is the part that can't be exercised by mocking fetch.
import { describe, it, expect, afterEach } from "vitest";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import type { Server as HttpServer } from "node:http";
import { createServer } from "../../scripts/print-bridge.mjs";

let bridge: HttpServer | null = null;
let printer: NetServer | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (bridge ? bridge.close(() => resolve()) : resolve()));
  await new Promise<void>((resolve) => (printer ? printer.close(() => resolve()) : resolve()));
  bridge = null;
  printer = null;
});

function listenEphemeral(server: HttpServer | NetServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

describe("print bridge server", () => {
  it("forwards the exact command bytes to the printer's raw TCP socket", async () => {
    const received: Buffer[] = [];
    printer = createNetServer((socket) => {
      socket.on("data", (chunk) => received.push(chunk));
    });
    const printerPort = await listenEphemeral(printer);

    bridge = createServer();
    const bridgePort = await listenEphemeral(bridge);

    const zpl = "^XA\n^FO24,24^A0N,38,38^FDTEST^FS\n^XZ";
    const res = await fetch(`http://127.0.0.1:${bridgePort}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "127.0.0.1", port: printerPort, data: zpl }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Allow the printer's TCP data event a tick to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(Buffer.concat(received).toString("utf8")).toBe(zpl);
  });

  it("returns a clear 502 when the printer refuses the connection", async () => {
    bridge = createServer();
    const bridgePort = await listenEphemeral(bridge);

    // Nothing listens on this port -- connection refused.
    const res = await fetch(`http://127.0.0.1:${bridgePort}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "127.0.0.1", port: 1, data: "^XA^XZ" }),
    });
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/could not reach printer/i);
  });

  it("validates the request body and rejects malformed/missing fields with 400", async () => {
    bridge = createServer();
    const bridgePort = await listenEphemeral(bridge);
    const base = `http://127.0.0.1:${bridgePort}/print`;

    const notJson = await fetch(base, { method: "POST", body: "not json" });
    expect(notJson.status).toBe(400);

    const missingHost = await fetch(base, { method: "POST", body: JSON.stringify({ port: 9100, data: "x" }) });
    expect(missingHost.status).toBe(400);

    const badPort = await fetch(base, { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: "not-a-port", data: "x" }) });
    expect(badPort.status).toBe(400);

    const emptyData = await fetch(base, { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 9100, data: "" }) });
    expect(emptyData.status).toBe(400);
  });

  it("answers GET /health", async () => {
    bridge = createServer();
    const bridgePort = await listenEphemeral(bridge);
    const res = await fetch(`http://127.0.0.1:${bridgePort}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("404s unknown routes and sets permissive CORS headers", async () => {
    bridge = createServer();
    const bridgePort = await listenEphemeral(bridge);
    const res = await fetch(`http://127.0.0.1:${bridgePort}/unknown`);
    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
