import { ReactNode } from "react";
import { useAuthSession } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import Login from "@/pages/Login";
import { Loader2 } from "lucide-react";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { session, ready } = useAuthSession();

  // Local dev fallback: if Supabase is not configured, allow the app through
  // so demo data still works. Production must always have env vars set.
  if (!supabaseConfigured) return <>{children}</>;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Login />;
  return <>{children}</>;
}
