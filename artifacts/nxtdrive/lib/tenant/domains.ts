import "server-only";
import { promises as dns } from "node:dns";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The platform root domain. Subdomains of this map to a tenant via slug. */
export const ROOT_DOMAIN = "nxtdrive.io";

/** Prefix for the DNS TXT record a school adds to prove domain ownership. */
export const VERIFY_TXT_PREFIX = "_nxtdrive-verify";

export type TenantDomainType = "subdomain" | "custom";
export type TenantDomainStatus = "pending" | "active" | "failed";

export type TenantDomain = {
  id: string;
  tenant_id: string;
  hostname: string;
  type: TenantDomainType;
  status: TenantDomainStatus;
  verification_token: string;
  is_primary: boolean;
  verified_at: string | null;
  created_at: string;
};

/**
 * Normalises a raw host string to a bare lowercase FQDN, or null when it is
 * not a plausible hostname. Strips protocol, path, port, leading `*.` and a
 * trailing dot. Used everywhere a hostname enters the system so storage,
 * routing and the TLS-ask all agree on the same canonical form.
 */
export function normalizeHostname(raw: string): string | null {
  let host = (raw ?? "").trim().toLowerCase();
  if (host === "") return null;
  // Drop scheme + any path/query.
  host = host.replace(/^[a-z]+:\/\//, "");
  host = host.split("/")[0] ?? "";
  // Drop port + trailing dot + wildcard prefix.
  host = host.split(":")[0] ?? "";
  host = host.replace(/\.$/, "");
  if (host.startsWith("*.")) host = host.slice(2);
  if (host === "") return null;
  // Basic FQDN shape: labels + a TLD. Mirrors the DB CHECK constraint.
  const ok =
    host.length >= 4 &&
    host.length <= 253 &&
    /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host);
  return ok ? host : null;
}

/** True when the host is the root domain or a subdomain of it. */
export function isPlatformHost(host: string): boolean {
  return host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);
}

/**
 * Classifies a normalised host as a platform subdomain or a custom domain.
 * Returns null for the bare root domain (handled by the marketing redirect).
 */
export function classifyHostname(
  host: string,
): { type: TenantDomainType; slug?: string } | null {
  if (host === ROOT_DOMAIN) return null;
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const label = host.slice(0, -(ROOT_DOMAIN.length + 1));
    // Only single-label subdomains map to a tenant slug.
    if (label === "" || label.includes(".")) return null;
    return { type: "subdomain", slug: label };
  }
  return { type: "custom" };
}

/** The DNS TXT record a school must add to prove ownership of a custom domain. */
export function verificationRecord(
  domain: Pick<TenantDomain, "hostname" | "verification_token">,
): {
  name: string;
  type: "TXT";
  value: string;
} {
  return {
    name: `${VERIFY_TXT_PREFIX}.${domain.hostname}`,
    type: "TXT",
    value: domain.verification_token,
  };
}

/**
 * The DNS record(s) that route traffic for a custom domain to NXTDRIVE. A
 * sub-domain (e.g. `app.rijschoolxyz.nl`) uses a CNAME; an apex/root domain
 * (e.g. `rijschoolxyz.nl`) cannot CNAME and needs an A/ALIAS record at the
 * provider. We point at the platform app host so the VPS IP is never hardcoded.
 */
export function trafficRecords(hostname: string): Array<{
  name: string;
  type: "CNAME" | "A/ALIAS";
  value: string;
  note: string;
}> {
  const isApex = hostname.split(".").length <= 2;
  if (isApex) {
    return [
      {
        name: hostname,
        type: "A/ALIAS",
        value: `app.${ROOT_DOMAIN}`,
        note: "Apex-domeinen kunnen geen CNAME; gebruik een ALIAS/ANAME-record of een A-record naar het IP van de VPS.",
      },
    ];
  }
  return [
    {
      name: hostname,
      type: "CNAME",
      value: `app.${ROOT_DOMAIN}`,
      note: "Zet een CNAME naar nxtdrive.io. Gebruik DNS-only (geen Cloudflare-proxy) zodat Caddy het certificaat kan ophalen.",
    },
  ];
}

/** Loads all domains for a tenant (primary first, then newest). */
export async function loadTenantDomains(
  service: SupabaseClient,
  tenantId: string,
): Promise<TenantDomain[]> {
  const { data, error } = await service
    .from("tenant_domains")
    .select(
      "id, tenant_id, hostname, type, status, verification_token, is_primary, verified_at, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Kon domeinen niet laden: ${error.message}`);
  }
  return (data ?? []) as TenantDomain[];
}

/**
 * Checks whether the ownership TXT record for a hostname currently contains the
 * expected verification token. Returns false on any DNS error (record missing,
 * NXDOMAIN, timeout) — verification is best-effort and never throws.
 */
export async function checkOwnershipTxt(
  hostname: string,
  token: string,
): Promise<boolean> {
  const name = `${VERIFY_TXT_PREFIX}.${hostname}`;
  try {
    const records = await dns.resolveTxt(name);
    // resolveTxt returns string[][] (each record may be chunked).
    return records.some((chunks) => chunks.join("").trim() === token);
  } catch {
    return false;
  }
}
