# Mega-sprint baseline

**Captured:** 2026-07-29
**Repository:** `/home/codex/repos/nxtdrive`
**Branch:** `main`
**Commit:** `5f4c94d63d1dc0b1bd4656a44b19cf6a6abdccf4`
**Worktree before sprint changes:** `docs/PHASE_PLAN.md` modified and
`docs/NXTDRIVE_DELIVERY_ROADMAP_2026.md` untracked. Both are pre-existing user
changes and are excluded from this sprint's edits.

## Toolchain and install

| Check | Command | Exit | Baseline |
| --- | --- | ---: | --- |
| Node | `node --version` | 0 | `v24.18.0` |
| pnpm | `pnpm --version` | 0 | `10.26.1` |
| package manager pin | inspect `package.json` | 0 | `pnpm@10.26.1` |
| frozen offline install | `pnpm install --frozen-lockfile --offline` | 0 | lockfile current; Sharp build script was not allowlisted |

The workspace contains 11 pnpm projects. The production Next application is
`artifacts/nxtdrive`; other runnable artifacts include `api-server` and
`mockup-sandbox`. There were 154 SQL migrations.

## Quality baseline

| Gate | Exact command | Exit | Evidence |
| --- | --- | ---: | --- |
| typecheck | `pnpm typecheck` | 0 | all libraries, scripts and artifacts passed |
| unit/integration bundle | `pnpm --filter @workspace/nxtdrive test` | 1 | 158 passed, 1 failed |
| production build | `pnpm --filter @workspace/nxtdrive build` | 0 | Next 15.5.18 compiled; 163 page routes |
| format | no script existed | n/a | missing hard gate |
| lint | no script existed | n/a | missing hard gate |
| E2E | no root/app gate existed | n/a | custom scripts existed, not a required Playwright gate |
| visual regression | no root/app gate existed | n/a | script existed; no checked-in image baseline |
| migration smoke | no root gate existed | n/a | migration utilities existed but were not release-blocking |

The failing test was:

```text
artifacts/nxtdrive/lib/invoices/payment-status-flow.test.ts
open invoice becomes directly payable when Mollie is configured
actual "overdue", expected "open"
```

Cause: `displayStatus()` used the system date while the surrounding flow used a
fixed `todayYmd`. Expected repair: inject the central Clock and use the tenant
time zone for the calendar day.

## Dependency audit

`pnpm audit --prod --json` exited non-zero:

| Severity | Count |
| --- | ---: |
| critical | 0 |
| high | 6 |
| moderate | 7 |
| low | 1 |

Confirmed affected production paths included Next.js 15.5.18, Sharp 0.34.5 /
libvips, PostCSS 8.4.31, `qs` 6.15.1 and `body-parser` 2.2.2. The release target
is zero critical and zero high production findings.

## Routes and architecture

- 163 page routes existed.
- 40 instructor pages existed under the English public prefix `/instructor`.
- Dutch and English duplicates coexisted, including `students`/`leerlingen`,
  `messages`/`berichten`, `tasks`/`taken`, `availability`/`beschikbaarheid`,
  `settings`/`instellingen`, `profile`/`profiel`, `reports`/`rapportages` and
  `vehicles`/`voertuigen`.
- There was no central route manifest.
- There was no canonical `/instructeur` route tree.
- 29 hand-written TypeScript/TSX/CSS files exceeded 800 lines. Largest:
  `lib/notifications/dispatch.ts` (2482), `lib/franchise/actions.ts` (2084),
  planning-board workspace (1673), notification templates (1513),
  `app/admin/page.tsx` (1482), RIS data (1443), instructor redesign views
  (1293) and student PWA (1295).

## Security, privacy and observability

- Middleware only set `nosniff`, referrer policy and `X-Frame-Options` on its
  protected-route matcher.
- There was no application CSP or Permissions Policy.
- Infrastructure Caddy files supplied HSTS, but application responses did not
  provide a complete shared header policy.
- No distributed application rate limiter was present.
- No central correlation-ID, structured logger or OTLP adapter was found.
- `/api/health` and `/api/health/ready` existed; canonical live, ready and
  version endpoints did not.
- A static `/privacy` page existed. Data-export request, deletion request,
  anonymisation, legal hold, configurable retention policy, dry-run and audit
  workflows were absent.

## PWA, screenshots, Android and workflows

- Instructor and student manifests/service worker existed.
- Four PWA screenshots were 576–577 bytes and were not acceptable real
  release/store evidence.
- Instructor/student PNG icons existed.
- No Android Gradle project or Capacitor configuration was present.
- Eight workflows existed, primarily deploy/cron/rollback. Required CI,
  E2E, visual, security and Android release workflows were absent.
- No signed AAB, signing fingerprint or Play track evidence existed.

This baseline records the starting point only. It is not a readiness claim.
