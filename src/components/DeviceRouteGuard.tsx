import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDeviceSurface } from "@/context/DeviceSurfaceContext";

export default function DeviceRouteGuard() {
  const { access } = useDeviceSurface();
  const location = useLocation();

  if (!access.allowed) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/surface-blocked${location.search}`} replace state={{ from }} />;
  }

  return <Outlet />;
}
