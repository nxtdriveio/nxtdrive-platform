#!/usr/bin/env bash
# Enable and verify wildcard TLS for *.nxtdrive.io on the production VPS.
#
# Usage:
#   sudo ./infra/enable-wildcard-tls.sh
#   sudo WILDCARD_TEST_HOST=test.nxtdrive.io ./infra/enable-wildcard-tls.sh
#
# Optional env vars:
#   CADDY_ENV_FILE=/etc/caddy/caddy.env
#   CADDY_WILDCARD_TARGET=/etc/caddy/sites-enabled/wildcard
#   WILDCARD_TEST_HOST=test.nxtdrive.io

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CADDY_ENV_FILE="${CADDY_ENV_FILE:-/etc/caddy/caddy.env}"
CADDY_WILDCARD_TARGET="${CADDY_WILDCARD_TARGET:-/etc/caddy/sites-enabled/wildcard}"
WILDCARD_TEST_HOST="${WILDCARD_TEST_HOST:-test.nxtdrive.io}"

echo "==> Verifying Caddy binary"
if ! command -v caddy >/dev/null 2>&1; then
  echo "Caddy is not installed." >&2
  exit 1
fi

if ! caddy list-modules | grep -q '^dns.providers.cloudflare$'; then
  cat >&2 <<'EOF'
Cloudflare DNS module is missing from the installed Caddy binary.

Required action on the VPS:
  sudo caddy add-package github.com/caddy-dns/cloudflare

Then re-run this script.
EOF
  exit 1
fi

echo "==> Verifying Cloudflare token"
if [[ ! -f "$CADDY_ENV_FILE" ]]; then
  echo "Missing Caddy env file: $CADDY_ENV_FILE" >&2
  exit 1
fi

if ! grep -Eq '^CLOUDFLARE_API_TOKEN=.+$' "$CADDY_ENV_FILE"; then
  cat >&2 <<EOF
CLOUDFLARE_API_TOKEN is not configured in $CADDY_ENV_FILE.

Expected:
  CLOUDFLARE_API_TOKEN=<token>
EOF
  exit 1
fi

echo "==> Enabling wildcard site block"
install -m 0644 "$REPO_ROOT/infra/Caddyfile.wildcard" "$CADDY_WILDCARD_TARGET"

echo "==> Validating Caddy config"
caddy validate --config /etc/caddy/Caddyfile

echo "==> Restarting Caddy"
systemctl restart caddy
systemctl --no-pager --full status caddy

echo "==> Verifying wildcard host shell"
curl --fail --silent --show-error --location \
  --max-time 20 \
  "https://${WILDCARD_TEST_HOST}/login" \
  >/dev/null

echo ""
echo "Wildcard TLS enabled and verified for https://${WILDCARD_TEST_HOST}/login"
