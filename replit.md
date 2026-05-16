# NXTDRIVE

Multi-tenant SaaS platform for driving schools — from first lead to passed exam, everything in one system.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Next.js app: `pnpm --filter @workspace/nxtdrive run dev`
- Required env: see Secrets section below

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend + backend: Next.js 15 App Router (server components, server actions)
- Database + Auth + Storage + RLS: Supabase (Postgres)
- UI: Tailwind CSS, shadcn/ui, Framer Motion
- Reverse proxy: Caddy (on VPS)
- CI/CD: GitHub Actions → staging → production

## Where things live

- `artifacts/nxtdrive/` — main Next.js application (to be created in Phase 1)
- `supabase/migrations/` — all database migrations, applied in order
- `supabase/seed.sql` — demo tenant seed data (NXTDRIVE Demo Academy only)
- `replit.md` — source of truth for rules, preferences and architecture decisions

## Architecture decisions

- NXTDRIVE is the platform brand. Driving schools are tenants. Never build for one school.
- Development tenant: NXTDRIVE Demo Academy (slug: `demo-academy`). Never hardcode Van Dijk.
- Multi-tenancy enforced at DB level via `tenant_id` on every tenant-scoped table + Supabase RLS.
- White-label branding only activates when `tenants.white_label_enabled = true`.
- Cancellation credit policy is tenant-configurable via `tenant_settings` (key: `cancellation_policy`). Never hardcoded.
- A user can hold multiple roles in the same tenant (e.g. tenant_admin + instructor for a solo instructor-owner). Memberships table: `UNIQUE(user_id, tenant_id, role)`.
- Platform admins are flagged via `profiles.is_platform_admin = true`, not via a membership row.
- Credit and invoice mutations are server-side only (service role key). Never client-side.
- Audit log is insert-only. No update or delete ever.
- Public intake submissions go through a server action (service role), never direct client RLS write.
- Next.js App Router is the only application framework. The existing Express API server is not the main app.
- Caddy is the reverse proxy on the VPS — not nginx.

## Product

NXTDRIVE covers the full student lifecycle for driving schools:
- Acquisition: marketing site, intake form, lead tracking
- Operations: scheduling, lesson management, CBR status tracking
- Finance: packages, credit ledger, invoices (Mollie deferred)
- Engagement: student PWA, instructor PWA

Subscription tiers (data model ready from day 1, enforcement deferred):
- NXTDRIVE Start — solo instructors
- NXTDRIVE Pro — growing schools
- NXTDRIVE Elite — multi-instructor, white-label, advanced features

## Domains

| Domain | Purpose |
|---|---|
| `nxtdrive.io` | Root / redirect |
| `rijschool.nxtdrive.io` | Public SaaS marketing site |
| `app.nxtdrive.io` | Unified login + all app routes |
| `staging.nxtdrive.io` | Staging environment (mirrors production) |
| `app.nxtdrive.io/admin` | Platform admin |
| `app.nxtdrive.io/backoffice` | Tenant admin + instructor backoffice |
| `app.nxtdrive.io/instructor` | Instructor PWA |
| `app.nxtdrive.io/student` | Student PWA |

## Infrastructure

- VPS IP: 178.251.232.105
- DNS: Cloudflare → nxtdrive.io
- Reverse proxy: Caddy (handles HTTPS termination, custom domain routing)
- Environments: staging (current Supabase project) + production (separate Supabase project, to be created)
- CI/CD: GitHub Actions — push to `staging` branch deploys to staging; push to `main` deploys to production

## Secrets (per environment)

| Secret | Used for |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Browser-safe public key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only — mutations, migrations, admin actions |
| `NEXTAUTH_SECRET` / `SESSION_SECRET` | Session signing |

Current Replit secrets are for STAGING. Production secrets managed separately (GitHub Actions secrets + VPS env).

## User preferences

- Do not start coding until the plan is approved per phase.
- Before each phase: list all files to be created or modified.
- After each phase: provide changed files, migrations, RLS policies, test steps, next phase.
- Never hardcode Van Dijk Rijschool anywhere in code, routes, component names or seed data.
- Only `demo-academy` in seed/demo data.
- Every tenant-scoped table gets `tenant_id`, RLS and indexes immediately — no exceptions.
- No financial balance mutation without a ledger entry and audit trail.
- No AI, CBR sync, Mollie or WhatsApp until the internal foundation is stable.
- Security and RLS must be tested before each new module is built.
- Use Caddy, not nginx, for reverse proxy.
- Domain: nxtdrive.io (not nxtdrive.nl).

## Gotchas

- Do NOT run `pnpm dev` at workspace root — no root dev script exists.
- Do NOT use `pnpm add --no-frozen-lockfile`.
- Supabase RLS uses `auth.uid()` — all mutations that bypass RLS must use the service role key on the server only.
- Caddy handles TLS via Cloudflare origin certificates or Let's Encrypt — configure accordingly on VPS.
- Staging Supabase = current secrets. Production Supabase = separate project, separate secrets.
- `credit_ledger` and `audit_log`: server-side writes only, never client-side.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Phase 0 plan: see conversation history (approved plan document)
- Blueprint source: `attached_assets/NXTDRIVE_Product_Blueprint_Replit_Faseplan_*.docx`
