# Baseline commands

```bash
node --version
pnpm --version
git status --short --branch
git rev-parse HEAD
pnpm install --frozen-lockfile --offline
pnpm typecheck
pnpm --filter @workspace/nxtdrive test
pnpm --filter @workspace/nxtdrive build
pnpm audit --prod --json
find artifacts/nxtdrive/app -type f -name 'page.tsx'
find artifacts/nxtdrive lib scripts/src -type f -print0 | xargs -0 wc -l
find .github/workflows -maxdepth 1 -type f
find supabase/migrations -maxdepth 1 -type f
```

The human-readable outcome and exact known failure are in
`docs/audit/mega-sprint-baseline.md`.
