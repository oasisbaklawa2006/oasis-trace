import { describe, expect, it } from "vitest";
import {
  DEVICE_SURFACE_CONTRACT_VERSION,
  TRACE_ROUTE_SURFACE_CENSUS,
  detectDeviceSurface,
  isCapabilityAllowed,
  navRoutesForSurface,
  parseDeviceSurfaceOverride,
  routeAccessForSurface,
  blockedRouteGuidance,
  isFastScanLayout,
  censusRowForRoute,
} from "./deviceSurfaceContract";

describe("TRACE_ROUTE_SURFACE_CENSUS — Point 99 device embedding census", () => {
  it("covers all App.tsx routes with versioned contract rows", () => {
    const routes = TRACE_ROUTE_SURFACE_CENSUS.map(r => r.route);
    expect(routes).toContain("/");
    expect(routes).toContain("/gate");
    expect(routes).toContain("/cartons");
    expect(routes).toContain("/printers");
    expect(routes).toContain("/settings");
    expect(TRACE_ROUTE_SURFACE_CENSUS).toHaveLength(16);
    expect(TRACE_ROUTE_SURFACE_CENSUS.every(r => r.tests.includes("src/lib/deviceSurfaceContract.test.ts"))).toBe(
      true,
    );
  });

  it("blocks generic gate and print logs on TV in favour of dedicated kiosks", () => {
    const gate = censusRowForRoute("/gate");
    const logs = censusRowForRoute("/print-logs");
    expect(gate?.deviceIntent.tv).toBe("blocked");
    expect(logs?.deviceIntent.tv).toBe("blocked");
  });

  it("blocks print/admin routes on TV", () => {
    for (const route of ["/printers", "/templates", "/reprints", "/settings", "/shipping"]) {
      const row = censusRowForRoute(route);
      expect(row?.deviceIntent.tv).toBe("blocked");
    }
  });

  it("allows scan-critical routes on mobile and handheld", () => {
    for (const route of ["/gate", "/cartons", "/finance"]) {
      const row = censusRowForRoute(route);
      expect(row?.deviceIntent.mobile).toBe("scan");
      expect(row?.deviceIntent.handheld).toBe("scan");
    }
  });

  it("documents embedding blockers without claiming physical UAT", () => {
    const shipping = censusRowForRoute("/shipping");
    expect(shipping?.embeddingBlockers.some(b => b.toLowerCase().includes("blocked"))).toBe(true);
    expect(DEVICE_SURFACE_CONTRACT_VERSION).toBe("1.0");
  });
});

describe("detectDeviceSurface — deterministic overrides", () => {
  it("honours explicit surface override", () => {
    expect(detectDeviceSurface({ widthPx: 1920, override: "tv" })).toBe("tv");
    expect(detectDeviceSurface({ widthPx: 360, override: "pc" })).toBe("pc");
    expect(parseDeviceSurfaceOverride("scanner")).toBe("handheld");
  });

  it("classifies mobile viewport", () => {
    expect(detectDeviceSurface({ widthPx: 390, coarsePointer: true })).toBe("mobile");
  });

  it("classifies handheld via UA or coarse pointer band", () => {
    expect(
      detectDeviceSurface({ widthPx: 800, userAgent: "Zebra TC57", coarsePointer: true }),
    ).toBe("handheld");
    expect(detectDeviceSurface({ widthPx: 900, coarsePointer: true })).toBe("handheld");
  });

  it("classifies TV via user agent", () => {
    expect(detectDeviceSurface({ widthPx: 1920, userAgent: "Mozilla/5.0 SmartTV" })).toBe("tv");
  });

  it("defaults to PC on wide desktop viewport", () => {
    expect(detectDeviceSurface({ widthPx: 1440, coarsePointer: false })).toBe("pc");
  });
});

describe("routeAccessForSurface — fail-closed route policy", () => {
  it("blocks shipping on mobile with guidance", () => {
    const r = routeAccessForSurface("/shipping", "mobile");
    expect(r.allowed).toBe(false);
    expect(r.guidance).toMatch(/PC operations/i);
  });

  it("allows gate scan on handheld in scan mode", () => {
    const r = routeAccessForSurface("/gate", "handheld");
    expect(r.allowed).toBe(true);
    expect(r.mode).toBe("scan");
    expect(r.readOnly).toBe(false);
  });

  it("blocks generic gate on TV with dedicated kiosk guidance", () => {
    const r = routeAccessForSurface("/gate", "tv");
    expect(r.allowed).toBe(false);
    expect(r.readOnly).toBe(true);
    expect(r.mode).toBe("blocked");
    expect(r.guidance).toMatch(/\/tv\/gate/i);
  });

  it("TV production is blocked", () => {
    const r = routeAccessForSurface("/production", "tv");
    expect(r.allowed).toBe(false);
    expect(blockedRouteGuidance("/production", "tv")).toMatch(/not available on TV/i);
  });
});

describe("isCapabilityAllowed — capability matrix", () => {
  it("PC allows print and admin", () => {
    expect(isCapabilityAllowed("pc", "print_command").allowed).toBe(true);
    expect(isCapabilityAllowed("pc", "admin_settings").allowed).toBe(true);
  });

  it("TV rejects write capabilities with explicit guidance", () => {
    const r = isCapabilityAllowed("tv", "reprint");
    expect(r.allowed).toBe(false);
    expect(r.guidance).toMatch(/hidden on TV/i);
  });

  it("mobile allows keyboard wedge but not print", () => {
    expect(isCapabilityAllowed("mobile", "keyboard_wedge_scan").allowed).toBe(true);
    expect(isCapabilityAllowed("mobile", "print_command").allowed).toBe(false);
  });
});

describe("navRoutesForSurface — filtered navigation", () => {
  it("TV nav excludes generic mutation-capable routes and print/admin routes", () => {
    const routes = navRoutesForSurface("tv").map(r => r.route);
    expect(routes).toContain("/");
    expect(routes).toContain("/trace");
    expect(routes).not.toContain("/gate");
    expect(routes).not.toContain("/print-logs");
    expect(routes).not.toContain("/printers");
    expect(routes).not.toContain("/settings");
  });

  it("mobile nav includes scan routes only from blocked write set", () => {
    const routes = navRoutesForSurface("mobile").map(r => r.route);
    expect(routes).toContain("/gate");
    expect(routes).toContain("/cartons");
    expect(routes).not.toContain("/production");
  });
});

describe("isFastScanLayout — responsive scan breakpoint", () => {
  it("enables fast scan at 640px and below", () => {
    expect(isFastScanLayout(640)).toBe(true);
    expect(isFastScanLayout(641)).toBe(false);
  });
});
