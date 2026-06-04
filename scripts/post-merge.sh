#!/bin/bash
set -e

# Post-merge setup for NXTDRIVE.
# This project uses ordered Supabase SQL migrations (supabase/migrations/),
# NOT drizzle-kit push. apply-migrations is idempotent: already-applied
# migrations are skipped, and it is non-interactive (no TTY prompts).
pnpm install --frozen-lockfile

# Run migrations if DATABASE_URL / STAGING_DATABASE_URL is configured and
# reachable. A missing or unreachable DB (e.g. Replit environment without a
# live Supabase project wired up) is not a hard error — CI and production
# deploys run migrations via GitHub Actions on the VPS.
if pnpm --filter @workspace/scripts run db:migrate; then
  echo "✅ Migrations applied."
else
  echo "⚠️  db:migrate failed (DATABASE_URL not set or unreachable). Skipping — migrations run via GitHub Actions on deploy."
fi
