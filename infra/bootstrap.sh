#!/usr/bin/env bash
# NXTDRIVE VPS bootstrap — run ONCE on a fresh Ubuntu VPS as root.
#
# Usage (on the VPS, as root):
#   curl -fsSL https://raw.githubusercontent.com/nxtdriveio/nxtdrive-platform/main/infra/bootstrap.sh -o bootstrap.sh
#   chmod +x bootstrap.sh
#   DEPLOYER_PUBKEY="ssh-ed25519 AAAA... github-actions-deploy" ./bootstrap.sh
#
# DEPLOYER_PUBKEY env var is REQUIRED — it is the public key whose private
# counterpart will be stored in the GitHub Actions secret SSH_PRIVATE_KEY.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if [[ -z "${DEPLOYER_PUBKEY:-}" ]]; then
  echo "DEPLOYER_PUBKEY env var is required." >&2
  echo "Example: DEPLOYER_PUBKEY=\"ssh-ed25519 AAAA... github-actions\" $0" >&2
  exit 1
fi

REPO_URL="https://github.com/nxtdriveio/nxtdrive-platform.git"
WORK_DIR="/root/nxtdrive-platform"

echo "==> [1/7] System packages"
apt-get update -y
apt-get install -y curl git rsync ca-certificates debian-keyring debian-archive-keyring apt-transport-https

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

echo "==> [2/7] Deployer user"
if ! id deployer >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deployer
fi
mkdir -p /home/deployer/.ssh
echo "$DEPLOYER_PUBKEY" > /home/deployer/.ssh/authorized_keys
chown -R deployer:deployer /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
chmod 600 /home/deployer/.ssh/authorized_keys

echo "==> [3/7] Sudo rules for deployer"
cat > /etc/sudoers.d/nxtdrive-deployer <<'EOF'
deployer ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-staging
deployer ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-production
EOF
chmod 440 /etc/sudoers.d/nxtdrive-deployer

echo "==> [4/7] Deploy directory layout"
mkdir -p /var/www/nxtdrive/staging/{releases,shared}
mkdir -p /var/www/nxtdrive/production/{releases,shared}
chown -R deployer:deployer /var/www/nxtdrive
mkdir -p /var/log/caddy
chown -R caddy:caddy /var/log/caddy 2>/dev/null || true

echo "==> [5/7] Fetch repo for infra config files"
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

echo "==> [6/7] systemd units"
cp "$WORK_DIR/infra/nxtdrive-staging.service"    /etc/systemd/system/
cp "$WORK_DIR/infra/nxtdrive-production.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable nxtdrive-staging nxtdrive-production
# Do NOT start them yet — they'll fail until the first deploy populates current/.

echo "==> [7/7] Caddy config"
mkdir -p /etc/caddy/sites-enabled
cp "$WORK_DIR/infra/Caddyfile.staging"    /etc/caddy/sites-enabled/staging
cp "$WORK_DIR/infra/Caddyfile.production" /etc/caddy/sites-enabled/production

# Overwrite the main Caddyfile with our managed version. Global options must
# come first; site definitions live under /etc/caddy/sites-enabled/*.
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
{
        email ops@nxtdrive.io
}

import /etc/caddy/sites-enabled/*
CADDYEOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo ""
echo "============================================================"
echo "  Bootstrap complete."
echo ""
echo "  Next steps:"
echo "  1. In Cloudflare, create A records pointing to this VPS:"
echo "       app.nxtdrive.io      -> $(curl -fsSL ifconfig.me || echo this-vps-ip)"
echo "       staging.nxtdrive.io  -> $(curl -fsSL ifconfig.me || echo this-vps-ip)"
echo "       nxtdrive.io          -> $(curl -fsSL ifconfig.me || echo this-vps-ip)"
echo "     Use DNS-only (grey cloud) until Caddy obtains TLS certs."
echo ""
echo "  2. Trigger a deploy by pushing to main (production) or staging."
echo "     The systemd units will start automatically on first deploy."
echo "============================================================"
