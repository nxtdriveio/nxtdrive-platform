# NXTDRIVE — Infrastructure & Scale Roadmap

Status: living document. Companion to `docs/INFRA_DEPLOYMENT.md` (the operational
runbook). This file describes the **multi-tenant domain architecture** and the
path to scale.

## Goals

- Every driving school (tenant) is reachable on its own web address **without a
  per-school code change or manual Caddy edit**.
- Two addressing modes:
  1. **Wildcard subdomain** — `<slug>.nxtdrive.io` (works the moment a tenant
     exists).
  2. **Custom domain** — e.g. `www.rijschoolxyz.nl` (self-service onboarding +
     DNS verification, white-label tiers).
- TLS is automatic and abuse-resistant: a single wildcard certificate for
  `*.nxtdrive.io`, and on-demand certificates for verified custom domains only.

## Components

| Layer | What | Where |
|---|---|---|
| Data | `tenant_domains` table — source of truth for routing **and** TLS-ask | `supabase/migrations/0088_tenant_domains.sql` |
| Resolve | host header → tenant | `artifacts/nxtdrive/lib/tenant/resolve-host.ts` |
| Domain helpers | hostname normalise/validate, DNS records, TXT verify | `artifacts/nxtdrive/lib/tenant/domains.ts` |
| TLS gate | Caddy on-demand "ask" endpoint | `artifacts/nxtdrive/app/api/tls-check/route.ts` |
| Onboarding | backoffice add/verify/remove/primary flow | `app/backoffice/instellingen` (Domeinen card) |
| Proxy | wildcard + custom-domain site blocks | `infra/Caddyfile.production` |
| Provisioning | on_demand_tls ask, CF token env, plugin notes | `infra/bootstrap.sh` |

## `tenant_domains` model

- One row per hostname. A hostname is **globally unique** — it can never point at
  two tenants.
- `type`: `subdomain` (`*.nxtdrive.io`) or `custom` (own domain).
- `status`: `pending` → `active` (verified) / `failed`.
- `verification_token`: random token; proven via a DNS TXT record.
- `is_primary`: at most one active domain per tenant is the canonical host.
- RLS: SELECT only, tenant_admin/platform-admin (the token is an ownership
  proof — not exposed to students/parents). All writes go through
  service-role-only `SECURITY DEFINER` RPCs (`add_tenant_domain`,
  `set_tenant_domain_status`, `set_primary_tenant_domain`,
  `remove_tenant_domain`) and are audited.

## Tenant resolution from the host header

`resolveTenantByHost(service, host)`:

1. Normalise the host (strip scheme/port/trailing dot, lowercase).
2. `<label>.nxtdrive.io` → tenant whose `slug === label`. **Reserved labels**
   (`app`, `staging`, `rijschool`, `www`, `api`, `admin`, …) are never treated as
   a slug.
3. A custom domain → the tenant owning an **active** `tenant_domains` row.
4. Anything unknown/erroring → `null` (safe fallback: callers keep the existing
   cookie/membership-based resolution). Host routing is **purely additive** and
   never throws.

> The authenticated app (`app.nxtdrive.io`) keeps cookie-based active-tenant
> resolution. Host-based resolution drives the public/marketing + white-label
> surfaces. The two never conflict because `app.` is a reserved label.

## TLS

### Wildcard `*.nxtdrive.io` — DNS-01 challenge

A single wildcard cert requires the **Cloudflare DNS challenge**, which the
default Caddy binary cannot do. One-time setup on the VPS:

```bash
# 1. Build Caddy with the Cloudflare DNS plugin
sudo caddy add-package github.com/caddy-dns/cloudflare    # Caddy 2.7+
#   (or rebuild: xcaddy build --with github.com/caddy-dns/cloudflare)

# 2. Provide a scoped token (Zone:DNS:Edit for nxtdrive.io)
sudo sh -c 'echo "CLOUDFLARE_API_TOKEN=<token>" > /etc/caddy/caddy.env'
sudo chown root:caddy /etc/caddy/caddy.env && sudo chmod 640 /etc/caddy/caddy.env

# 3. Restart
sudo systemctl restart caddy
```

DNS: add a wildcard record `*.nxtdrive.io → <VPS IP>` (DNS-only / grey cloud).
The `*.nxtdrive.io` site block in `infra/Caddyfile.production` uses
`tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} }`.

### Custom domains — on-demand TLS gated by an "ask"

The global options block (`/etc/caddy/Caddyfile`, written by `bootstrap.sh`):

```caddy
{
    email ops@nxtdrive.io
    on_demand_tls {
        ask http://127.0.0.1:5001/api/tls-check
        interval 2m
        burst 5
    }
}
```

The catch-all `https://` site block uses `tls { on_demand }`. Before Caddy
obtains a certificate for an unknown host it calls `/api/tls-check?domain=<host>`:

- `200` → host is a verified custom domain (`tenant_domains.status='active'`) →
  Caddy issues a cert.
- `403` → `*.nxtdrive.io` (covered by the wildcard, never on-demand).
- `404` → unknown/unverified host → **no cert** (blocks cert abuse / DoS).
- `503` → lookup failed → fail closed.

### School-facing DNS (custom domain onboarding)

A tenant_admin adds a domain in **Backoffice → Instellingen → Domeinen** and gets:

1. **Ownership** — a TXT record at `_nxtdrive-verify.<host>` = the verification
   token. "Verifiëren" runs a server-side DNS TXT lookup and, on success, flips
   the row to `active`.
2. **Traffic** — a `CNAME <host> → app.nxtdrive.io` (sub-domain) or an
   `A`/`ALIAS` record (apex). DNS-only, so Caddy can complete the TLS handshake.

## Scale roadmap (next)

- **Caching tenant lookups** — memoise host→tenant (short TTL) to avoid a DB
  round-trip per request once subdomain traffic grows.
- **Rate limiting** — build Caddy with the `caddy-ratelimit` plugin and add
  `rate_limit` to the public site blocks (placeholder noted in the Caddyfiles).
- **Horizontal app scale** — the app is stateless behind Caddy; add app
  instances and load-balance via Caddy upstreams. Sessions live in Supabase.
- **Read scale** — Supabase read replicas / connection pooling for heavy
  reporting once tenant count grows.
- **Per-tenant observability** — structured logs already carry the host; add
  per-tenant dashboards/log routing.
- **Custom-domain automation** — optional API-driven DNS pre-checks and
  email/notification when a domain goes active.
