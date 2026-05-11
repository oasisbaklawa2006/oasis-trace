import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      toast.success("Welcome back");
    } catch (err: any) {
      toast.error(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-gold shadow-gold" />
          <div>
            <p className="text-[10px] font-semibold tracking-[0.22em] text-muted-foreground">OASIS BAKLAWA</p>
            <h1 className="text-2xl font-semibold">Label Studio</h1>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <h2 className="mb-1 text-lg font-semibold">Sign in</h2>
          <p className="mb-6 text-sm text-muted-foreground">Use your Oasis Supabase credentials.</p>

          {!supabaseConfigured ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
              Supabase env vars are missing. Set <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> to enable login.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : "Sign in"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Test Mode — RLS Off
        </p>
      </div>
    </div>
  );
}
