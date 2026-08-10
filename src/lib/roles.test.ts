import { describe, it, expect } from "vitest";
import { canSubmitCentralScan, getOlsRolesFromSession } from "./roles";
import type { Session } from "@supabase/supabase-js";

describe("roles", () => {
  it("reads roles from JWT app_metadata", () => {
    const session = {
      user: { app_metadata: { ols_roles: ["dispatch", "security"] } },
    } as unknown as Session;
    expect(getOlsRolesFromSession(session)).toContain("dispatch");
    expect(canSubmitCentralScan(session)).toBe(true);
  });

  it("denies submit without roles", () => {
    const session = { user: { app_metadata: {} } } as unknown as Session;
    expect(canSubmitCentralScan(session)).toBe(false);
  });

  it("ignores caller-editable user_metadata roles", () => {
    const session = {
      user: { app_metadata: {}, user_metadata: { ols_roles: ["admin", "dispatch"] } },
    } as unknown as Session;
    expect(getOlsRolesFromSession(session)).toEqual([]);
    expect(canSubmitCentralScan(session)).toBe(false);
  });
});
