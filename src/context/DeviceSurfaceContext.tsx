import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  type DeviceCapability,
  type DeviceSurface,
  detectDeviceSurface,
  isCapabilityAllowed,
  type RouteAccessResult,
} from "@/lib/deviceSurfaceContract";
import { runtimeRouteAccessForSurface } from "@/lib/deviceSurfaceRuntimePolicy";

export interface DeviceSurfaceContextValue {
  surface: DeviceSurface;
  readOnly: boolean;
  access: RouteAccessResult;
  can: (capability: DeviceCapability) => boolean;
  capabilityGuidance: (capability: DeviceCapability) => string;
  fastScanLayout: boolean;
}

const DeviceSurfaceContext = createContext<DeviceSurfaceContextValue | null>(null);

function readCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function DeviceSurfaceProvider({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const [widthPx, setWidthPx] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [coarsePointer, setCoarsePointer] = useState(readCoarsePointer);

  useEffect(() => {
    const onResize = () => setWidthPx(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const onChange = () => setCoarsePointer(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Runtime device authority is derived only from actual viewport/pointer/UA signals.
  // URL/query/local-storage input must never relax a governed surface restriction.
  const surface = useMemo(
    () =>
      detectDeviceSurface({
        widthPx,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        coarsePointer,
      }),
    [widthPx, coarsePointer],
  );

  const access = useMemo(
    () => runtimeRouteAccessForSurface(pathname, surface),
    [pathname, surface],
  );

  const value = useMemo<DeviceSurfaceContextValue>(() => {
    const can = (capability: DeviceCapability) => isCapabilityAllowed(surface, capability).allowed;
    const capabilityGuidance = (capability: DeviceCapability) =>
      isCapabilityAllowed(surface, capability).guidance;
    return {
      surface,
      readOnly: access.readOnly,
      access,
      can,
      capabilityGuidance,
      fastScanLayout: widthPx <= 640,
    };
  }, [surface, access, widthPx]);

  return (
    <DeviceSurfaceContext.Provider value={value}>{children}</DeviceSurfaceContext.Provider>
  );
}

export function useDeviceSurface(): DeviceSurfaceContextValue {
  const ctx = useContext(DeviceSurfaceContext);
  if (!ctx) {
    throw new Error("useDeviceSurface must be used within DeviceSurfaceProvider");
  }
  return ctx;
}
