import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant } from "@/lib/types";
import {
  ROOT_DOMAIN,
  classifyHostname,
  normalizeHostname,
} from "./domains";

/**
 * Subdomain labels of nxtdrive.io that are platform-reserved and must NEVER be
 * resolved to a tenant slug. These belong to the platform itself (login,
 * marketing, staging, the API) — see replit.md "Domains".
 */
export const RESERVED_SUBDOMAINS = new Set([
  "app",
  "staging",
  "rijschool",
  "www",
  "api",
  "admin",
  "mail",
  "static",
  "assets",
]);

const TENANT_COLUMNS = "id, slug, name, plan, white_label_enabled";

/**
 * Resolves the tenant for an inbound host header.
 *
 *  - `<slug>.nxtdrive.io`  → tenant whose slug === <slug> (reserved labels skipped)
 *  - a custom domain        → tenant owning an *active* tenant_domains row
 *
 * Returns null for the root domain, reserved subdomains, unknown hosts, or any
 * lookup error. Callers MUST treat null as "no tenant context" and fall back to
 * the default (cookie-based) resolution — host routing is purely additive and
 * never throws.
 *
 * Uses the service-role client because anon RLS would hide rows for an
 * unauthenticated public visitor.
 */
export async function resolveTenantByHost(
  service: SupabaseClient,
  hostHeader: string | null | undefined,
): Promise<Tenant | null> {
  const host = normalizeHostname(hostHeader ?? "");
  if (!host) return null;

  const classified = classifyHostname(host);
  if (!classified) return null; // bare root domain

  if (classified.type === "subdomain") {
    const slug = classified.slug;
    if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null;
    const { data, error } = await service
      .from("tenants")
      .select(TENANT_COLUMNS)
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as Tenant;
  }

  // Custom domain: only an *active* (verified) hostname routes.
  const { data: domainRow, error: domainErr } = await service
    .from("tenant_domains")
    .select("tenant_id")
    .eq("hostname", host)
    .eq("status", "active")
    .maybeSingle();
  if (domainErr || !domainRow) return null;

  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("id", domainRow.tenant_id)
    .maybeSingle();
  if (tenantErr || !tenant) return null;
  return tenant as Tenant;
}

/** Convenience for log/debug context. */
export { ROOT_DOMAIN };
