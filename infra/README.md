# NXTDRIVE infrastructure — one-time VPS setup

This folder contains the bootstrap script, Caddy config and systemd units for
the **GitHub self-hosted runner** deployment model.

> **Deployment model:** the GitHub Actions runner lives *on the VPS*. CI builds,
> migrates and publishes releases **locally** on the box — there is **no
> SSH/scp/rsync-over-network deploy**. The old `SSH_*` secrets are retired.

The full operational runbook (audit, readiness, clean DB rebuild, deploy/rollback
flow, implementation order) lives in [`docs/INFRA_DEPLOYMENT.md`](../docs/INFRA_DEPLOYMENT.md).

## Quick start

On a fresh Ubuntu 24.04 VPS, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/nxtdriveio/nxtdrive-platform/main/infra/bootstrap.sh -o bootstrap.sh
chmod +x bootstrap.sh
./bootstrap.sh
```

`bootstrap.sh` is idempotent and installs/configures:

1. System packages — Caddy, Node 24, pnpm, rsync, git, plus `ufw`, `fail2ban`,
   `unattended-upgrades`.
2. A shared `nxtdrive` group, the `deployer` runtime user, and (if present) the
   `github-runner` user added to that group.
3. Sudo rules: the runner may only `systemctl restart nxtdrive-staging`,
   `systemctl restart nxtdrive-production` and `systemctl reload caddy`.
4. `/var/www/nxtdrive/{staging,production}/{releases,shared}` — group `nxtdrive`,
   `2775` (group-writable + setgid).
5. systemd units (enabled, not started — first deploy starts them).
6. Caddy site configs + managed `/etc/caddy/Caddyfile`.
7. UFW firewall (80/443 open, SSH allowed — tighten to admin IPs).
8. Fail2Ban + automatic security updates.

## After bootstrap

1. **Install the GitHub self-hosted runner** (GitHub → Settings → Actions →
   Runners) and register it with the labels **`self-hosted, nxtdrive-vps`**.
   Then add it to the shared group and restart it:

   ```bash
   sudo usermod -aG nxtdrive github-runner
   sudo systemctl restart actions.runner.*
   ```

2. **DNS (Cloudflare)** — A records to the VPS IP:

   | Record | Target |
   |---|---|
   | `staging.nxtdrive.io` | VPS IP |
   | `app.nxtdrive.io` | VPS IP |
   | `nxtdrive.io` | VPS IP |
   | `rijschool.nxtdrive.io` | VPS IP (marketing, later) |

   Use **DNS only** (grey cloud) until Caddy has issued certs, then optionally
   flip to **Proxied**.

3. **GitHub Actions environment secrets** — set per environment (`staging`,
   `production`):

   | Secret | Used for |
   |---|---|
   | `*_SUPABASE_URL` | Supabase project URL |
   | `*_SUPABASE_ANON_KEY` | Browser-safe public key |
   | `*_SUPABASE_SERVICE_ROLE_KEY` | Server-side mutations/migrations |
   | `*_SESSION_SECRET` | Session signing |
   | `*_DATABASE_URL` | Migration runner connection string |

   (`*` = `STAGING` or `PRODUCTION`.) The `SSH_*` secrets are no longer used and
   can be deleted.

4. **Deploy** — push to `staging` (→ staging) or `main` (→ production).
   The first deploy starts the systemd unit automatically.

## How a deploy works (self-hosted)

1. Checkout + `pnpm install` + `typecheck` + `build` in the runner workspace.
2. Apply pending DB migrations against the target Supabase project.
3. Write `/var/www/nxtdrive/<env>/shared/.env`.
4. Publish: rsync the validated build into
   `/var/www/nxtdrive/<env>/releases/<timestamp>/`, recreate `node_modules`
   from the lockfile, swap the `current/` symlink, `sudo systemctl restart`.
5. Poll `http://127.0.0.1:<port>/api/health` until `200` (fails the job if not).
6. Prune to the 5 most recent releases.

## Rollback

Run the **Rollback** workflow (`workflow_dispatch`), pick the environment, and
optionally a specific release timestamp (defaults to the previous release). It
repoints `current/`, restarts the service and health-checks. Migrations are
forward-only and are **not** reverted automatically.
