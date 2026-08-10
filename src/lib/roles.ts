/**
 * Role checks for sensitive actions.
 * Production: trusted JWT `app_metadata.ols_roles` only. User metadata is
 * caller-editable and must never grant authority.
 * Demo/offline: optional localStorage fallback only when Supabase auth is off.
 */
import type { Session } from "@supabase/supabase-js";
import { supabaseConfigured } from "@/lib/supabase";

export type OlsRole =
  | "admin"
  | "dispatch"
  | "security"
  | "production"
  | "finance"
  | "packing";

const SUBMIT_ROLES: OlsRole[] = ["admin", "dispatch", "security"];
const REPRINT_APPROVE_ROLES: OlsRole[] = ["admin"];

export function getOlsRolesFromSession(session: Session | null | undefined): OlsRole[] {
  if (!session?.user) return [];
  const raw = session.user.app_metadata?.ols_roles;
  if (Array.isArray(raw)) {
    return raw.filter((r): r is OlsRole => typeof r === "string");
  }
  return [];
}

/** Demo-only fallback — never used when Supabase auth is configured. */
export function getDemoFallbackRoles(): OlsRole[] {
  if (supabaseConfigured || typeof localStorage === "undefined") return [];
  try {
    const v = localStorage.getItem("ols_role");
    return v ? [v as OlsRole] : [];
  } catch {
    return [];
  }
}

export function resolveOlsRoles(session: Session | null | undefined): OlsRole[] {
  const fromJwt = getOlsRolesFromSession(session);
  if (fromJwt.length > 0) return fromJwt;
  return getDemoFallbackRoles();
}

export function canSubmitCentralScan(session: Session | null | undefined): boolean {
  return resolveOlsRoles(session).some(r => SUBMIT_ROLES.includes(r));
}

export function canApproveReprint(session: Session | null | undefined): boolean {
  return resolveOlsRoles(session).some(r => REPRINT_APPROVE_ROLES.includes(r));
}

export function requireSubmitRole(session: Session | null | undefined): void {
  if (!canSubmitCentralScan(session)) {
    throw new Error("Dispatch or security role required to submit scans to Central.");
  }
}
