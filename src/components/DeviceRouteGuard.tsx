import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDeviceSurface } from "@/context/DeviceSurfaceContext";

export default function DeviceRouteGuard() {
  const { access } = useDeviceSurface();
  const location = useLocation();

  if (!access.allowed) {
    return <Navigate to="/surface-blocked" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
