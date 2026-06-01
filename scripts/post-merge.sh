#!/bin/bash
set -e

# Post-merge setup for NXTDRIVE.
# This project uses ordered Supabase SQL migrations (supabase/migrations/),
# NOT drizzle-kit push. apply-migrations is idempotent: already-applied
# migrations are skipped, and it is non-interactive (no TTY prompts).
pnpm install --frozen-lockfile
pnpm --filter @workspace/scripts run db:migrate
