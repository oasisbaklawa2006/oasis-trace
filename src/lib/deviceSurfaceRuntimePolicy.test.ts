import { describe, expect, it } from "vitest";
import { runtimeRouteAccessForSurface } from "./deviceSurfaceRuntimePolicy";

describe("post-Macro device surface runtime policy", () => {
  it("allows dedicated TV kiosks only as read-only surfaces", () => {
    expect(runtimeRouteAccessForSurface("/tv/gate", "tv")).toEqual({
      allowed: true,
      mode: "read",
      readOnly: true,
    });
    expect(runtimeRouteAccessForSurface("/tv/dispatch", "pc").readOnly).toBe(true);
    expect(runtimeRouteAccessForSurface("/tv/gate", "mobile").allowed).toBe(false);
  });

  it("blocks generic mutation-capable gate and print-log pages on TV", () => {
    const gate = runtimeRouteAccessForSurface("/gate", "tv");
    const logs = runtimeRouteAccessForSurface("/print-logs", "tv");
    expect(gate.allowed).toBe(false);
    expect(gate.guidance).toMatch(/dedicated \/tv\/gate/i);
    expect(logs.allowed).toBe(false);
  });

  it("preserves scan access for handheld gate use", () => {
    const gate = runtimeRouteAccessForSurface("/gate", "handheld");
    expect(gate.allowed).toBe(true);
    expect(gate.mode).toBe("scan");
    expect(gate.readOnly).toBe(false);
  });
});
