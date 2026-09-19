import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDeviceSurface } from "@/context/DeviceSurfaceContext";

export default function DeviceRouteGuard() {
  const { access } = useDeviceSurface();
  const location = useLocation();

  if (!access.allowed) {
    // Do not propagate attacker-controlled query text into the blocked-route URL.
    // Surface authority is derived from device signals, and guidance needs only the governed pathname.
    return <Navigate to="/surface-blocked" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
