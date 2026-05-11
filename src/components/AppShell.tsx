import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Printer, FileImage, Factory, Boxes, PackageCheck, ClipboardList,
  Receipt, Truck, Tag, ShieldCheck, Search, History, RotateCcw, BarChart3, Settings,
  Menu, X, CircleDot,
} from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase";
import { probeLiveMode, subscribeMode } from "@/lib/data";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/printers", label: "Printers", icon: Printer, group: "Setup" },
  { to: "/templates", label: "Label Templates", icon: FileImage, group: "Setup" },
  { to: "/production", label: "Production Entry", icon: Factory, group: "Production" },
  { to: "/stock", label: "Stock Units", icon: Boxes, group: "Production" },
  { to: "/cartons", label: "Cartonization", icon: PackageCheck, group: "Dispatch" },
  { to: "/dpl", label: "DPL Documents", icon: ClipboardList, group: "Dispatch" },
  { to: "/finance", label: "Finance PI Bridge", icon: Receipt, group: "Finance" },
  { to: "/dispatch", label: "Dispatch Bundle", icon: Truck, group: "Dispatch" },
  { to: "/shipping", label: "Shipping Labels", icon: Tag, group: "Dispatch" },
  { to: "/gate", label: "Gate Scan", icon: ShieldCheck, group: "Security" },
  { to: "/trace", label: "Traceability", icon: Search, group: "Operations" },
  { to: "/print-logs", label: "Print Logs", icon: History, group: "Operations" },
  { to: "/reprints", label: "Reprint Requests", icon: RotateCcw, group: "Operations" },
  { to: "/reports", label: "Reports", icon: BarChart3, group: "Operations" },
  { to: "/settings", label: "Settings & Permissions", icon: Settings, group: "Admin" },
];

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"live" | "demo" | "unknown">("unknown");
  const [modeError, setModeError] = useState<string | undefined>();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const off = subscribeMode((m, err) => { setMode(m); setModeError(err); });
    probeLiveMode();
    return off;
  }, []);

  const grouped = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar mobile */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-elevated" />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">OASIS</p>
            <p className="-mt-0.5 text-sm font-semibold">Label Studio</p>
          </div>
        </div>
        <button onClick={() => setOpen(v => !v)} className="rounded-lg p-2 hover:bg-secondary" aria-label="Toggle menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 transform overflow-y-auto bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-gold shadow-gold" />
          <div>
            <p className="text-[10px] font-semibold tracking-[0.22em] text-sidebar-foreground/70">OASIS BAKLAWA</p>
            <p className="-mt-0.5 text-base font-semibold text-sidebar-accent-foreground">Label Studio</p>
          </div>
        </div>
        <nav className="px-3 pb-8">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-5">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">{group}</p>
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )
                  }
                >
                  <Icon size={18} className="opacity-90" />
                  <span className="flex-1">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-6 pb-6 text-[11px] text-sidebar-foreground/55">
          <div className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
            mode === "live" ? "border-success/50 bg-success/15 text-success"
              : "border-warning/50 bg-warning/15 text-warning"
          )}>
            <CircleDot size={10} />
            {mode === "live" ? "Live Supabase Mode" : "Demo Fallback Mode"}
          </div>
          {mode === "demo" && modeError && (
            <p className="mt-2 text-[10px] leading-snug text-sidebar-foreground/45">{modeError}</p>
          )}
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <main className="lg:pl-72">
        {mode === "demo" && !supabaseConfigured && (
          <div className="border-b bg-warning/10 px-6 py-2 text-xs text-warning-foreground/80">
            Demo mode — add <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
