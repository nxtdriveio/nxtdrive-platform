#!/usr/bin/env bash
# NXTDRIVE VPS bootstrap — run ONCE on a fresh Ubuntu 24.04 VPS as root.
#
# This provisions the box for the GitHub SELF-HOSTED RUNNER deploy model:
# the runner builds and publishes releases locally, so there is NO SSH-based
# CI deploy. Admin SSH access is expected to be locked down to whitelisted
# IPs at the provider/cloud-firewall level.
#
# Usage (on the VPS, as root):
#   curl -fsSL https://raw.githubusercontent.com/nxtdriveio/nxtdrive-platform/main/infra/bootstrap.sh -o bootstrap.sh
#   chmod +x bootstrap.sh
#   ./bootstrap.sh
#
# Optional env vars:
#   DEPLOYER_PUBKEY="ssh-ed25519 AAAA... admin"  # add an SSH key to the
#                                                # deployer user (optional; the
#                                                # runner model does not need it)
#   RUNNER_USER="github-runner"                  # the OS user the GitHub
#                                                # self-hosted runner runs as
#                                                # (default: github-runner)
#
# The GitHub self-hosted runner itself must be installed separately via the
# GitHub UI (Settings -> Actions -> Runners) and registered with the labels:
#   self-hosted, nxtdrive-vps
# This script is idempotent — safe to re-run.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

REPO_URL="https://github.com/nxtdriveio/nxtdrive-platform.git"
WORK_DIR="/root/nxtdrive-platform"
RUNNER_USER="${RUNNER_USER:-github-runner}"

echo "==> [1/9] System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  curl git rsync ca-certificates gnupg \
  debian-keyring debian-archive-keyring apt-transport-https \
  ufw fail2ban unattended-upgrades

# Caddy official repo
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# Node.js 24 + pnpm
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10.26.1
fi

echo "==> [2/9] Shared group, deployer + runner users"
# Shared group lets the runner (publishes releases) and the runtime user
# (reads/serves them) both work in /var/www/nxtdrive.
getent group nxtdrive >/dev/null || groupadd nxtdrive

# deployer = the unprivileged user the systemd services run as.
if ! id deployer >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deployer
fi
usermod -aG nxtdrive deployer

# Optional admin SSH key on the deployer user.
if [[ -n "${DEPLOYER_PUBKEY:-}" ]]; then
  mkdir -p /home/deployer/.ssh
  echo "$DEPLOYER_PUBKEY" > /home/deployer/.ssh/authorized_keys
  chown -R deployer:deployer /home/deployer/.ssh
  chmod 700 /home/deployer/.ssh
  chmod 600 /home/deployer/.ssh/authorized_keys
fi

# The GitHub runner user (created by the runner installer). Add to nxtdrive
# if it already exists; otherwise warn — it must be added after runner install.
if id "$RUNNER_USER" >/dev/null 2>&1; then
  usermod -aG nxtdrive "$RUNNER_USER"
else
  echo "    NOTE: runner user '$RUNNER_USER' does not exist yet."
  echo "    After installing the GitHub runner, run:"
  echo "      sudo usermod -aG nxtdrive $RUNNER_USER && sudo systemctl restart actions.runner.*"
fi

echo "==> [3/9] Sudo rules"
# The runner restarts the app services and reloads Caddy. Nothing else.
cat > /etc/sudoers.d/nxtdrive-runner <<EOF
$RUNNER_USER ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-staging
$RUNNER_USER ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-production
$RUNNER_USER ALL=(root) NOPASSWD: /bin/systemctl reload caddy
EOF
chmod 440 /etc/sudoers.d/nxtdrive-runner

# Keep a deployer rule too, for manual ops from the box.
cat > /etc/sudoers.d/nxtdrive-deployer <<'EOF'
deployer ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-staging
deployer ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-production
EOF
chmod 440 /etc/sudoers.d/nxtdrive-deployer
visudo -c >/dev/null

echo "==> [4/9] Deploy directory layout"
mkdir -p /var/www/nxtdrive/staging/{releases,shared}
mkdir -p /var/www/nxtdrive/production/{releases,shared}
# Group-owned + group-writable + setgid so files created by the runner stay in
# the nxtdrive group and remain writable by deployer (for .next/cache etc).
# IMPORTANT: chmod DIRECTORIES ONLY — a recursive chmod would broaden the mode
# of shared/.env (which holds the service-role key) and leak secrets on rerun.
chgrp -R nxtdrive /var/www/nxtdrive
find /var/www/nxtdrive -type d -exec chmod 2775 {} +
# Re-tighten any env files in case a previous run loosened them.
find /var/www/nxtdrive -type f -name '.env' -exec chmod 640 {} + 2>/dev/null || true
mkdir -p /var/log/caddy
chown -R caddy:caddy /var/log/caddy 2>/dev/null || true

echo "==> [5/9] Fetch repo for infra config files"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -d "$SCRIPT_REPO_ROOT/.git" && -f "$SCRIPT_REPO_ROOT/infra/Caddyfile.production" ]]; then
  echo "    Running from existing repo at $SCRIPT_REPO_ROOT — skipping fetch."
  WORK_DIR="$SCRIPT_REPO_ROOT"
elif [[ ! -d "$WORK_DIR/.git" ]]; then
  git clone --depth 1 "$REPO_URL" "$WORK_DIR"
else
  git -C "$WORK_DIR" fetch --depth 1 origin main
  git -C "$WORK_DIR" reset --hard origin/main
fi

echo "==> [6/9] systemd units"
cp "$WORK_DIR/infra/nxtdrive-staging.service"    /etc/systemd/system/
cp "$WORK_DIR/infra/nxtdrive-production.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable nxtdrive-staging nxtdrive-production
# Do NOT start them yet — they'll fail until the first deploy populates current/.

echo "==> [7/9] Caddy config"
mkdir -p /etc/caddy/sites-enabled
cp "$WORK_DIR/infra/Caddyfile.staging"    /etc/caddy/sites-enabled/staging
cp "$WORK_DIR/infra/Caddyfile.production" /etc/caddy/sites-enabled/production

# Caddy environment file — holds CLOUDFLARE_API_TOKEN for the wildcard DNS-01
# challenge (*.nxtdrive.io). Created empty + locked down; fill it in manually
# with a Cloudflare API token scoped to Zone:DNS:Edit for nxtdrive.io. The
# wildcard cert + custom-domain on-demand TLS won't work until this is set and
# Caddy is built with the cloudflare DNS plugin (see Next steps below).
if [[ ! -f /etc/caddy/caddy.env ]]; then
  cat > /etc/caddy/caddy.env <<'ENVEOF'
# Cloudflare API token (Zone:DNS:Edit for nxtdrive.io) — required for the
# *.nxtdrive.io wildcard certificate. Leave unset to disable wildcard TLS.
CLOUDFLARE_API_TOKEN=
ENVEOF
fi
chown root:caddy /etc/caddy/caddy.env
chmod 640 /etc/caddy/caddy.env

# Load that env file into the caddy service.
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/override.conf <<'DROPEOF'
[Service]
EnvironmentFile=-/etc/caddy/caddy.env
DROPEOF
systemctl daemon-reload

# Overwrite the main Caddyfile with our managed version. Global options must
# come first; site definitions live under /etc/caddy/sites-enabled/*.
# on_demand_tls.ask gates certificate issuance for CUSTOM domains: Caddy asks
# the production app whether an incoming host is a verified tenant domain before
# obtaining a cert, so arbitrary hosts can't trigger cert issuance (DoS/abuse).
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
{
        email ops@nxtdrive.io

        on_demand_tls {
                ask http://127.0.0.1:5001/api/tls-check
                interval 2m
                burst 5
        }
}

import /etc/caddy/sites-enabled/*
CADDYEOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo "==> [8/9] Firewall (UFW)"
ufw allow 80/tcp
ufw allow 443/tcp
# SSH: keep a rule so you don't lock yourself out. Tighten to whitelisted
# admin IPs at the cloud firewall (Hetzner) and/or replace with:
#   ufw allow from <ADMIN_IP> to any port 22 proto tcp
ufw allow OpenSSH
ufw --force enable

echo "==> [9/9] Fail2Ban + unattended-upgrades"
systemctl enable --now fail2ban
# Enable automatic security updates non-interactively.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades 2>/dev/null || true

echo ""
echo "============================================================"
echo "  Bootstrap complete."
echo ""
echo "  Next steps:"
echo "  1. Install the GitHub self-hosted runner (Settings -> Actions ->"
echo "     Runners). Register it with labels: self-hosted, nxtdrive-vps"
echo "     Then add it to the shared group:"
echo "       sudo usermod -aG nxtdrive $RUNNER_USER"
echo "       sudo systemctl restart actions.runner.*"
echo ""
echo "  2. In Cloudflare, create A records pointing to this VPS:"
echo "       app.nxtdrive.io      -> $(curl -fsSL ifconfig.me || echo this-vps-ip)"
echo "       staging.nxtdrive.io  -> $(curl -fsSL ifconfig.me || echo this-vps-ip)"
echo "       nxtdrive.io          -> $(curl -fsSL ifconfig.me || echo this-vps-ip)"
echo "       *.nxtdrive.io        -> $(curl -fsSL ifconfig.me || echo this-vps-ip)  (wildcard for tenant subdomains)"
echo "     Use DNS-only (grey cloud) until Caddy obtains TLS certs."
echo ""
echo "  3. Enable WILDCARD subdomain TLS (*.nxtdrive.io) — one-time, opt-in."
echo "     (Custom-domain on-demand TLS already works without this step.)"
echo "       a. Build Caddy with the Cloudflare DNS plugin:"
echo "            sudo caddy add-package github.com/caddy-dns/cloudflare"
echo "          (or rebuild with xcaddy --with github.com/caddy-dns/cloudflare)"
echo "       b. Put a Cloudflare token (Zone:DNS:Edit for nxtdrive.io) in"
echo "            /etc/caddy/caddy.env  (CLOUDFLARE_API_TOKEN=...)"
echo "       c. Enable the wildcard site block (kept out of the default config"
echo "          so bootstrap validates on a box without the plugin):"
echo "            sudo cp $WORK_DIR/infra/Caddyfile.wildcard /etc/caddy/sites-enabled/wildcard"
echo "       d. sudo systemctl restart caddy"
echo "     Custom domains then verify + serve automatically via the backoffice"
echo "     domain-onboarding flow. See docs/INFRA_ROADMAP.md."
echo ""
echo "  4. Set GitHub Actions environment secrets (staging + production),"
echo "     then push to 'staging' or 'main' to deploy. See"
echo "     docs/INFRA_DEPLOYMENT.md for the full runbook."
echo "============================================================"
