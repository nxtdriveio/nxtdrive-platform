# NXTDRIVE Production Readiness Checklist

Status: working checklist
Last updated: 2026-06-15
Owner: product / engineering / operations

## Purpose

This document answers one question:

What still needs to be true before NXTDRIVE should be treated as production-ready for real tenant usage at low operational risk?

It is intentionally stricter than “the UI exists” or “the happy flow works once”.

## Current Position

NXTDRIVE already has a strong operational foundation:

- multi-tenant auth and RLS isolation,
- organization / branch / membership model,
- lead intake and conversion,
- student dossiers,
- lesson planning,
- invoices, credits and accounting,
- instructor PWA,
- student PWA,
- parent portal,
- franchise foundation,
- white-label foundation,
- platform admin,
- early AI assistance.

The main remaining work is no longer schema design.
It is production hardening, completion discipline, operational safety and consistency.

## Completed Recently

### Theme and white-label foundation

- platform-managed theme presets for light and dark mode,
- tenant preset assignment from platform backoffice,
- tenant-level theme overrides on top of a central preset,
- preview switching for student / instructor / backoffice shells,
- semantic theme token runtime resolution instead of only a single primary color,
- broader migration of admin/backoffice status and chart surfaces to theme-aware tokens.

### Session and baseline performance work

- persistent auth cookie policy introduced for longer-lived sessions,
- middleware excludes unnecessary PWA asset requests,
- request-scoped caching added for branding, theme and notification bootstrap reads,
- duplicated layout bootstrapping reduced.

This is useful progress, but it is not yet the full performance or production hardening pass.

### Entitlements completion

- fresh server-side entitlement snapshots introduced as the canonical plan state,
- branch, staff, custom-domain, white-label, franchise, AI and reporting gates
  migrated away from stale request tenant assumptions,
- downgrade/read-only behavior clarified for existing branches, white-label,
  franchise networks and commercial exports,
- direct CSV export routes now enforce advanced-reporting access server-side.

### Live readiness foundation

- auth cookies now default to 90 days and can be tuned with
  `NXTDRIVE_SESSION_MAX_AGE_DAYS`,
- middleware auth refresh is limited to protected app routes instead of almost
  every request,
- protected app responses get baseline security headers from the Next layer in
  addition to the reverse proxy,
- PWA manifests are cacheable with host-aware `Vary` headers for white-label
  safety,
- the Caddy TLS ask endpoint now returns explicit no-store, nosniff responses,
- Next package import optimization is enabled for icon/chart-heavy surfaces.

### Monitoring, smoke and runbook foundation

- `/api/health/ready` now checks required runtime secrets and a lightweight
  Supabase service-role database read,
- a production smoke runner validates health, readiness, PWA manifests, login
  page rendering and optional student/instructor login flows,
- deploy workflows now run a deploy-integrated smoke pass after the health gate,
  using HTTP shell checks for live login surfaces and manifests,
- a browser-driven E2E business-flow runner now covers seeded login/session
  reuse, lead to trial lesson to student conversion, lesson scheduling and
  completion, student/instructor messaging, branch isolation, white-label host
  shells, the student payment entrypoint and persistent auth cookies /
  session retention,
- a scheduled GitHub smoke monitor now runs against staging and production and
  uses issue-based alerting when public smoke checks fail,
- route-level loading states were added for the student, instructor and
  backoffice shells to improve perceived navigation speed,
- route performance budgets can now be checked with
  `pnpm --filter @workspace/scripts run check-route-performance`,
- the heaviest route outlier `/account/wachtwoord-wijzigen` dropped from
  `570 kB` to `180 kB` first load, and notification template editors dropped
  from `256 kB` to `108 kB`,
- `docs/PRODUCTION_RUNBOOK.md` now documents deploy verification, smoke tests,
  incident triage, rollback, route performance budgets and session retention
  verification.
## Hard Go-Live Requirements

These are the items that should be completed before production rollout is treated as stable.

### 1. Entitlements and commercial enforcement

Required:

- one source of truth for plan gating,
- consistent server-side enforcement on all protected mutations,
- explicit downgrade / read-only behavior where tenants exceed limits,
- backoffice messaging that explains what is blocked and why,
- platform admin control over subscription state without ambiguity.

Why:

Without this, plan behavior remains partially implicit and commercial scope can drift from actual platform behavior.

### 2. Performance pass

Required:

- continue reducing unnecessary `force-dynamic` usage,
- add route-level loading states and skeletons for the heaviest surfaces,
- keep auditing repeated bootstrap queries across layouts and dashboards,
- keep route performance budgets green in `check-route-performance`,
- review expensive pages for server-render cost and over-invalidation,
- measure cold and warm navigation on student / instructor / backoffice.

Why:

The current app is functional, but still too server-heavy for a “native-fast” feel.

### 3. PWA device-quality pass

Required:

- full student PWA real-device pass on Android portrait,
- full instructor PWA pass on tablet landscape and mobile fallback,
- safe-area, bottom-nav, sticky header and notification tray validation,
- card scaling and typography validation on smaller widths,
- no dead zones, clipped trays or avoidable scroll at first viewport.

Why:

These apps are already real, but still not uniformly device-perfect.

### 4. Monitoring and operational safety

Required:

- error monitoring,
- uptime and health monitoring,
- cron/job visibility,
- webhook failure visibility,
- retry workflows for failed notifications and payment side effects,
- rollback checklist and release verification checklist.

Why:

Without this, production incidents become slow to detect and expensive to debug.

### 5. E2E coverage for business-critical flows

Minimum required flows:

- tenant admin invite and first login,
- student self-service login and session persistence,
- lead to trial lesson to student conversion,
- lesson scheduling and lesson completion,
- invoice payment and credit activation,
- messaging between student and instructor,
- branch-scope isolation,
- white-label host resolution and themed shells.

Current production finding from the browser E2E pass:

- the functional suite is green for production on login/session persistence,
  lead -> trial lesson -> student conversion, lesson scheduling/completion,
  student/instructor messaging, branch isolation, white-label subdomain shells
  and the student payments entrypoint;
- optional checks remain configuration-dependent:
  `E2E_CUSTOM_DOMAIN_HOST` and `E2E_ENABLE_PAYMENT_REDIRECT=1`.

Why:

The platform is broad enough that manual QA alone is no longer sufficient.

### 6. White-label completion

Required:

- finish remaining hardcoded non-semantic color uses on live user-facing surfaces,
- brand transactional emails,
- verify theme behavior in both light and dark mode per shell,
- define preset governance and override rules operationally.

Why:

White-label is now structurally real, but not yet fully complete as a commercial offer.

### 7. Documentation and support materials

Required:

- platform admin manual,
- tenant admin / backoffice manual,
- instructor app manual,
- student app quickstart,
- white-label/domain setup guide,
- finance and operations guide,
- deployment and rollback runbook,
- release checklist,
- support troubleshooting playbook.

Why:

A real production product needs operator documentation, not just code knowledge.

## Recommended Execution Order Before Broad Production

1. Performance and session-retention pass
2. PWA device-quality pass
3. Monitoring / ops / rollback tooling
4. Critical E2E coverage
5. White-label completion
6. Documentation and runbooks

## Suggested Release Gates

NXTDRIVE should not be considered broadly production-ready until all of the following are true:

- critical flows are E2E-covered,
- no unresolved plan-enforcement gaps remain,
- student and instructor PWA pass real-device QA,
- session persistence is verified in production,
- monitoring and alerting are active,
- rollback steps are documented and tested,
- first-line product manuals exist for operators.

## What I Would Add Beyond the Current Plan

- a true platform ops center for failed jobs, failed webhooks, failed notifications and manual retries,
- a tenant health scorecard in platform admin,
- explicit performance budgets per route,
- a documented theme governance model:
  - system preset,
  - tenant preset,
  - tenant overrides,
  - fallback behavior on downgrade,
- a release train discipline with smoke tests after each production deploy.
