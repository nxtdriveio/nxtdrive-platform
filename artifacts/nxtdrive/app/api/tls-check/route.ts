import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isPlatformHost, normalizeHostname } from "@/lib/tenant/domains";

export const dynamic = "force-dynamic";

function tlsResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Caddy on-demand-TLS "ask" endpoint.
 *
 * Before Caddy obtains a certificate for an unknown host it calls this endpoint
 * (`on_demand_tls { ask http://127.0.0.1:<port>/api/tls-check }`) with
 * `?domain=<host>`. We approve (HTTP 200) ONLY hosts that are a verified custom
 * domain (`tenant_domains.status = 'active'`). Anything else is rejected so an
 * attacker cannot make Caddy issue certs for arbitrary hostnames (cert abuse /
 * rate-limit exhaustion / DoS).
 *
 * Subdomains of nxtdrive.io are covered by the wildcard certificate (DNS-01
 * challenge) and must NOT go through on-demand — we reject them here too.
 */
export async function GET(req: NextRequest) {
  const host = normalizeHostname(req.nextUrl.searchParams.get("domain") ?? "");
  if (!host) {
    return tlsResponse("invalid domain", 400);
  }

  // Wildcard cert already covers *.nxtdrive.io — never issue on-demand for it.
  if (isPlatformHost(host)) {
    return tlsResponse("managed by wildcard", 403);
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("tenant_domains")
    .select("id")
    .eq("hostname", host)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    // Fail closed: do not authorise a cert when the lookup failed.
    return tlsResponse("lookup failed", 503);
  }

  return data
    ? tlsResponse("ok", 200)
    : tlsResponse("unknown host", 404);
}
