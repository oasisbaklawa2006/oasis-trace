// Client for the local print bridge (scripts/print-bridge.mjs). The browser
// cannot open raw TCP sockets to a networked thermal printer's port 9100
// itself, so generated TSPL/ZPL text is POSTed to a small local HTTP bridge
// running on the operator's own machine, which forwards it to the printer.

export interface PrintTarget {
  /** Base URL of the local bridge, e.g. "http://127.0.0.1:9191". */
  bridgeUrl: string;
  /** Printer's network host/IP. */
  host: string;
  /** Printer's raw port -- almost always 9100 for TSC/Zebra/XPrinter. */
  port: number;
}

/** Optional network/bridge fields, stored alongside PrinterProfile in ols_printers.settings. */
export interface PrinterConnection {
  bridgeUrl?: string;
  host?: string;
  port?: number;
}

export function connectionIsConfigured(c: PrinterConnection): c is Required<PrinterConnection> {
  return Boolean(c.bridgeUrl && c.host && c.port);
}

export type PrintResult = { ok: true; message: string } | { ok: false; message: string };

const BRIDGE_UNREACHABLE =
  "Could not reach the local print bridge. Make sure it's running (node scripts/print-bridge.mjs) on this machine, or copy the commands and send them another way.";

/** Sends generated TSPL/ZPL command text to a printer via the local bridge. */
export async function sendToPrintBridge(target: PrintTarget, data: string): Promise<PrintResult> {
  if (!target.bridgeUrl.trim()) return { ok: false, message: "No print bridge URL configured for this printer." };
  if (!target.host.trim()) return { ok: false, message: "No printer host/IP configured." };
  if (!Number.isInteger(target.port) || target.port <= 0) return { ok: false, message: "No valid printer port configured." };

  let response: Response;
  try {
    response = await fetch(`${target.bridgeUrl.replace(/\/$/, "")}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: target.host, port: target.port, data }),
    });
  } catch {
    return { ok: false, message: BRIDGE_UNREACHABLE };
  }

  let body: { ok?: boolean; message?: string } | null = null;
  try { body = await response.json(); } catch { /* fall through to status-based message */ }

  if (response.ok && body?.ok) return { ok: true, message: body.message ?? "Sent to printer." };
  return { ok: false, message: body?.message ?? `Print bridge returned ${response.status}.` };
}

/** Checks whether the local bridge is reachable at all, for a "bridge status" indicator. */
export async function checkPrintBridgeHealth(bridgeUrl: string): Promise<boolean> {
  if (!bridgeUrl.trim()) return false;
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
