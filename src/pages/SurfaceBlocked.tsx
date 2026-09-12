import { Link, useLocation } from "react-router-dom";
import { MonitorOff } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useDeviceSurface } from "@/context/DeviceSurfaceContext";
import { blockedRouteGuidance, censusRowForRoute, surfaceDisplayLabel } from "@/lib/deviceSurfaceContract";

export default function SurfaceBlocked() {
  const { surface } = useDeviceSurface();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? location.pathname;
  const row = censusRowForRoute(from);
  const guidance = row ? blockedRouteGuidance(row.route, surface) : blockedRouteGuidance(from, surface);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow="Surface policy"
        title="Route not available on this device"
        description={`${surfaceDisplayLabel(surface)} — software embedding policy. Physical device UAT is separate.`}
      />
      <div className="ols-card flex flex-col items-center gap-4 p-8 text-center">
        <MonitorOff size={48} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{guidance}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="default">
            <Link to="/">Open Dashboard</Link>
          </Button>
          {(surface === "mobile" || surface === "handheld") && (
            <Button asChild variant="outline">
              <Link to="/gate">Gate Scan</Link>
            </Button>
          )}
          {surface === "tv" && (
            <Button asChild variant="outline">
              <Link to="/tv/gate">Gate Display</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
