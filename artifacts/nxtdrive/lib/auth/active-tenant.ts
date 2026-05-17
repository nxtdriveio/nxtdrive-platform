import { cookies } from "next/headers";
import type { AuthenticatedUser, Tenant } from "@/lib/types";
import { uniqueTenants } from "./session";

const COOKIE = "nxt_active_tenant";

export async function getActiveTenantId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setActiveTenantId(tenantId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearActiveTenant(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/**
 * Resolves the tenant the user is currently "in". Priority:
 *  1. Cookie value, if it matches one of the user's tenants.
 *  2. If the user has exactly one tenant, that one (auto-pick).
 *  3. null — caller should redirect to /select-tenant.
 */
export async function resolveActiveTenant(
  user: AuthenticatedUser,
): Promise<Tenant | null> {
  const tenants = uniqueTenants(user);
  if (tenants.length === 0) return null;
  if (tenants.length === 1) return tenants[0]!;

  const cookieId = await getActiveTenantId();
  if (cookieId) {
    const match = tenants.find((t) => t.id === cookieId);
    if (match) return match;
  }
  return null;
}
