#!/usr/bin/env node
// OASIS LABEL STUDIO — local print bridge.
//
// Runs on the same machine (or LAN) as a thermal label printer. Receives
// generated TSPL/ZPL command text over HTTP from the browser app and
// forwards it verbatim to the printer's raw TCP port (9100 on almost every
// TSC/Zebra/XPrinter network-attached label printer). Browsers cannot open
// raw TCP sockets themselves, so this small always-on bridge is the
// standard way to get generated printer commands onto real hardware.
//
// Run: node scripts/print-bridge.mjs [--port 9191] [--bind 127.0.0.1]
// Env: PRINT_BRIDGE_PORT, PRINT_BRIDGE_BIND, PRINT_BRIDGE_ALLOWED_ORIGIN
//
// Security: binds to 127.0.0.1 by default -- only reachable from the same
// machine, not the wider LAN. Any origin loaded in the browser on that
// machine can call it (CORS is permissive by design, since this is a local
// trusted-device bridge, not a network service) -- do not bind it to 0.0.0.0
// on a shared or untrusted machine.

import { createServer as createHttpServer } from "node:http";
import { Socket } from "node:net";

const MAX_BODY_BYTES = 64 * 1024; // a label's worth of TSPL/ZPL, generous headroom
const PRINTER_CONNECT_TIMEOUT_MS = 4000;
const PRINTER_WRITE_TIMEOUT_MS = 8000;

/**
 * Sends `data` to `host:port` over a raw TCP socket and resolves once the
 * write is flushed and the socket closes (or times out). Rejects with a
 * human-readable message on connect failure, write failure, or timeout --
 * never throws a raw Node error object at the HTTP layer.
 */
export function sendToPrinter({ host, port, data }) {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };

    socket.setTimeout(PRINTER_CONNECT_TIMEOUT_MS);
    socket.once("timeout", () => finish(reject, new Error(`Timed out connecting to printer at ${host}:${port}`)));
    socket.once("error", (err) => finish(reject, new Error(`Could not reach printer at ${host}:${port} (${err.code ?? err.message})`)));

    socket.connect(port, host, () => {
      socket.setTimeout(PRINTER_WRITE_TIMEOUT_MS);
      socket.write(data, "utf8", (writeErr) => {
        if (writeErr) { finish(reject, new Error(`Failed writing to printer: ${writeErr.message}`)); return; }
        // Half-close our side; most label printers don't reply on 9100, so
        // don't wait indefinitely for the printer to close -- ending our
        // write side and resolving immediately after a successful flush is
        // the correct, standard raw-socket print behaviour.
        socket.end();
        finish(resolve, undefined);
      });
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { reject(new Error("Payload too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": process.env.PRINT_BRIDGE_ALLOWED_ORIGIN || "*",
  });
  res.end(payload);
}

export function createServer({ allowedOrigin } = {}) {
  return createHttpServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin || process.env.PRINT_BRIDGE_ALLOWED_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, service: "ols-print-bridge" });
      return;
    }

    if (req.method !== "POST" || req.url !== "/print") {
      sendJson(res, 404, { ok: false, message: "Not found. POST /print or GET /health." });
      return;
    }

    let raw;
    try {
      raw = await readBody(req);
    } catch (err) {
      sendJson(res, 413, { ok: false, message: err instanceof Error ? err.message : "Could not read request body" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { ok: false, message: "Body must be JSON: { host, port, data }" });
      return;
    }

    const { host, port, data } = parsed ?? {};
    if (typeof host !== "string" || !host.trim()) { sendJson(res, 400, { ok: false, message: "host is required" }); return; }
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) { sendJson(res, 400, { ok: false, message: "port must be a valid port number" }); return; }
    if (typeof data !== "string" || !data.length) { sendJson(res, 400, { ok: false, message: "data (the TSPL/ZPL command text) is required" }); return; }

    try {
      await sendToPrinter({ host, port: portNum, data });
      sendJson(res, 200, { ok: true, message: `Sent ${data.length} bytes to ${host}:${portNum}` });
    } catch (err) {
      sendJson(res, 502, { ok: false, message: err instanceof Error ? err.message : "Print failed" });
    }
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") out.port = Number(argv[++i]);
    else if (argv[i] === "--bind") out.bind = argv[++i];
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const port = args.port || Number(process.env.PRINT_BRIDGE_PORT) || 9191;
  const bind = args.bind || process.env.PRINT_BRIDGE_BIND || "127.0.0.1";
  const server = createServer();
  server.listen(port, bind, () => {
    console.log(`OLS print bridge listening on http://${bind}:${port} (POST /print, GET /health)`);
    console.log(`Bound to ${bind} -- ${bind === "127.0.0.1" ? "only this machine can reach it" : "reachable from other machines on this interface"}.`);
  });
}
