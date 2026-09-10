import {
  type DeviceSurface,
  type RouteAccessResult,
  routeAccessForSurface,
} from "./deviceSurfaceContract";

const DEDICATED_TV_ROUTES = new Set(["/tv/gate", "/tv/dispatch"]);
const UNSAFE_GENERIC_TV_ROUTES = new Set(["/gate", "/print-logs"]);

/**
 * Runtime overlay for the post-Macro Trace router.
 * Macro #37 introduced dedicated TV kiosk routes; generic gate/print-log pages still
 * contain mutation controls, so TV must never rely on a visual read-only banner there.
 */
export function runtimeRouteAccessForSurface(
  pathname: string,
  surface: DeviceSurface,
): RouteAccessResult {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";

  if (DEDICATED_TV_ROUTES.has(path)) {
    if (surface === "tv" || surface === "pc") {
      return { allowed: true, mode: "read", readOnly: true };
    }
    return {
      allowed: false,
      mode: "blocked",
      readOnly: true,
      guidance: "TV kiosk routes are reserved for TV displays or PC testing.",
    };
  }

  if (surface === "tv" && UNSAFE_GENERIC_TV_ROUTES.has(path)) {
    return {
      allowed: false,
      mode: "blocked",
      readOnly: true,
      guidance:
        path === "/gate"
          ? "Use the dedicated /tv/gate display. Interactive Gate Scan is disabled on TV."
          : "Interactive Print Logs/reprint controls are disabled on TV displays.",
    };
  }

  return routeAccessForSurface(path, surface);
}
