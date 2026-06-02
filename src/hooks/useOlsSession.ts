import { useAuthSession } from "@/lib/auth";
import { canApproveReprint, canSubmitCentralScan, resolveOlsRoles } from "@/lib/roles";

/** Auth session + OLS role helpers for UI gates. */
export function useOlsSession() {
  const { session, ready } = useAuthSession();
  return {
    session,
    ready,
    roles: resolveOlsRoles(session),
    canSubmitCentral: canSubmitCentralScan(session),
    canApproveReprint: canApproveReprint(session),
  };
}
