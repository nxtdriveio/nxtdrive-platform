# NXTDRIVE — Infrastructure & Deployment

Operational source of truth for hosting, deployment and database lifecycle.

- **Hosting:** single Hetzner VPS (CPX41, Ubuntu 24.04).
- **Reverse proxy:** Caddy (HTTPS termination, security headers).
- **Process supervision:** systemd (`nxtdrive-staging`, `nxtdrive-production`).
- **App:** Next.js 15 App Router (`@workspace/nxtdrive`), one full-workspace build.
- **DB / Auth / Storage / RLS:** Supabase (separate projects for staging + production).
- **CI/CD:** GitHub Actions on a **self-hosted runner that lives on the VPS**.

---

## 1. Deployment model (self-hosted runner)

The GitHub Actions runner runs **on the VPS** with labels `self-hosted,
nxtdrive-vps`. The build and the release publish happen on the same machine, so
there is **no SSH/scp/rsync-over-network deploy** and no CI SSH key.

```
push to main      -> Deploy production -> /var/www/nxtdrive/production
push to staging   -> Deploy staging    -> /var/www/nxtdrive/staging
workflow_dispatch -> Rollback          -> repoint current/ + restart
```

### Per-deploy steps (`.github/workflows/deploy-*.yml`)

1. Checkout, `pnpm install --frozen-lockfile`, `pnpm run typecheck`.
2. `pnpm --filter @workspace/nxtdrive run build` (validated artifact).
3. `db:migrate --env=<env>` against the target Supabase project.
4. Write `/var/www/nxtdrive/<env>/shared/.env` (mode `640`, group `nxtdrive`).
5. **Publish** under `umask 002`: rsync the validated tree (keeping `.next`,
   excluding `node_modules`, `.git`, `.next/cache`, `attached_assets`) into
   `releases/<timestamp>/`, recreate `node_modules` with
   `pnpm install --frozen-lockfile`, swap the `current/` symlink, then
   `sudo systemctl restart <service>`.
6. **Health check:** poll `http://127.0.0.1:<port>/api/health` up to 60s; the
   job fails if it never returns `200`.
7. Prune to the 5 most recent releases.

Because the build is validated **before** the symlink swap, a broken build never
takes the live site down — `current/` only moves after a successful build.

### Ports

| Environment | systemd unit | Port | Domain |
|---|---|---|---|
| staging | `nxtdrive-staging` | 5000 | `staging.nxtdrive.io` |
| production | `nxtdrive-production` | 5001 | `app.nxtdrive.io` |
| (redirect) | — | — | `nxtdrive.io` → `rijschool.nxtdrive.io` |

### Filesystem permissions

- `/var/www/nxtdrive` is group `nxtdrive`, mode `2775` (group-writable + setgid).
- The runner (`github-runner`) and the runtime user (`deployer`) are both in the
  `nxtdrive` group. The runner publishes; `deployer` serves.
- Deploy steps run under `umask 002` so the runtime user can write `.next/cache`.

### Health endpoint

`GET /api/health` → `200 {"status":"ok",...}`. No auth, no DB; it only proves
the Node process is up and serving. Used by the deploy/rollback health gate.

`GET /api/health/ready` is the readiness endpoint. It validates required runtime
environment variables and a lightweight Supabase service-role database read. Use
this for external uptime/readiness monitoring and manual release verification,
not for the fast systemd restart gate.

Production smoke checks:

```bash
SMOKE_BASE_URL=https://app.nxtdrive.io \
  pnpm --filter @workspace/scripts run smoke:production
```

---

## 2. Rollback

Run the **Rollback** workflow (`workflow_dispatch`):

- **environment**: `staging` | `production`.
- **release**: optional release timestamp; empty = previous release.

It repoints `current/` at the target release, restarts the service, and
health-checks. **Migrations are forward-only** — if a rollback needs the old
schema, revert it manually against Supabase first.

---

## 3. Clean database rebuild (both environments)

The entire schema lives as ordered migrations in `supabase/migrations/`
(`0001…` upward). A fresh Supabase project is rebuilt by running them in order.

> Seed data (`demo-academy`) is **staging only**. **Never seed production.**

### 3.1 Create / reset the Supabase projects

1. In Supabase, create (or reset) the **staging** and **production** projects.
2. Collect for each: project URL, anon key, service-role key, and the pooler
   connection string (`DATABASE_URL`).

### 3.2 Point secrets at the new projects

- **GitHub Actions** → environment secrets for `staging` and `production`
  (see the table in `infra/README.md`).
- **Replit** (local dev = staging): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_DATABASE_URL`.

### 3.3 Apply migrations

The runner does this automatically on deploy, or run manually with the env var
the migration runner expects:

```bash
# staging
STAGING_DATABASE_URL=postgres://... \
  pnpm --filter @workspace/scripts run db:migrate -- --env=staging

# production
PRODUCTION_DATABASE_URL=postgres://... \
  pnpm --filter @workspace/scripts run db:migrate -- --env=production
```

Applied migrations are tracked per-DB in `public._migrations`, so re-running is
idempotent.

### 3.4 Seed (staging only)

```bash
STAGING_DATABASE_URL=postgres://... \
  pnpm --filter @workspace/scripts run db:seed
# optional dev login accounts:
pnpm --filter @workspace/scripts run db:seed-dev-accounts
```

### 3.5 Verify RLS

Run the RLS test scripts (`scripts/package.json` → `db:test-rls-*`) against the
fresh DB before opening it up. Security/RLS must pass before a module is trusted.

---

## 4. First-time VPS provisioning

See `infra/README.md` for the `bootstrap.sh` quick start. Summary:

1. `bootstrap.sh` (as root) — packages, `nxtdrive` group, `deployer` user,
   sudoers, dir layout, systemd units, Caddy, UFW, Fail2Ban, auto-updates.
2. Install the GitHub runner, label it `self-hosted, nxtdrive-vps`, add it to
   the `nxtdrive` group, restart it.
3. DNS A records (Cloudflare) → VPS IP.
4. Set GitHub environment secrets.
5. Push to deploy.

---

## 5. Security posture

**Implemented**

- HTTPS via Caddy (Let's Encrypt). Security headers on every response: HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `-Server`.
- systemd hardening: `NoNewPrivileges`, `ProtectSystem=full`, `ProtectHome`,
  `PrivateTmp`, `Protect*Kernel*`, `RestrictSUIDSGID`, graceful
  `TimeoutStopSec=30`.
- Least-privilege sudo for the runner (restart units + reload Caddy only).
- UFW (80/443 + SSH), Fail2Ban, unattended security upgrades.
- Service-role key is server-side only; never shipped to the browser bundle.

**Recommendations (not yet implemented)**

- **Rate limiting** — the default Caddy binary has no `rate_limit`. Build Caddy
  with the [`caddy-ratelimit`](https://github.com/mholt/caddy-ratelimit) plugin
  via `xcaddy` and add a `rate_limit` block to the site configs (e.g. throttle
  `/api/*` and login).
- **SSH lockdown** — restrict port 22 to whitelisted admin IPs at the Hetzner
  cloud firewall (preferred) and/or tighten the UFW rule.
- **Cloudflare proxied mode** — once certs are issued, optionally enable the
  orange cloud for WAF/DDoS in front of Caddy.
- **Off-box log shipping / uptime monitoring** — external probe on
  `/api/health` plus readiness probe on `/api/health/ready`.

---

## 6. Implementation order (for a from-scratch cutover)

1. Provision the VPS with `bootstrap.sh`.
2. Install + label + group the GitHub self-hosted runner.
3. Create the two Supabase projects; set GitHub + Replit secrets.
4. DNS A records → VPS; wait for Caddy TLS.
5. Push to `staging`: migrate, deploy, seed, run RLS tests, smoke-test.
6. Push to `main`: migrate (no seed) and deploy production.
7. Verify `/api/health`, security headers, and a Rollback dry-run.
8. Delete the retired `SSH_*` GitHub secrets.
