# NXTDRIVE Organization Foundation

Status: architecture foundation
Owner: platform architecture
Last updated: 2026-06-06

## Decision

In the current NXTDRIVE implementation, `tenants` are the technical backing
model for product Organizations.

Product language:

```text
Organization -> Branch -> Team -> User / Student / Vehicle / Planning / Tasks
```

Current technical language:

```text
Tenant -> Branch -> Department/Team -> Membership / Student / Vehicle / Lesson / Task
```

This means:

- Do not rename `tenants` in the database in the near term.
- Use `Organization` naming for new product-facing code, docs, and domain helpers.
- Keep `tenant_id` as the mandatory isolation key on tenant-owned data.
- Add `branch_id` only where the entity is operationally assignable to a branch.
- Add team scope separately from task boards/departments where people-permission scope is needed.

## Non-negotiable Invariants

Every organization-owned entity must answer these questions before it is built:

| Question | Required answer |
|---|---|
| What is the owning organization? | `tenant_id` is required unless the row is truly platform-global. |
| Can this row belong to a branch? | Add nullable `branch_id` only when branch operations need it. |
| Can this row be team-scoped? | Add `team_id` or a mapping table only when permissions/assignment require it. |
| Who can read it? | RLS policy must be explicit. No broad tenant reads for private user data. |
| Who can write it? | Prefer service-role-only SECURITY DEFINER RPCs for mutations. |
| How is it audited? | Important writes must insert into `audit_log`. |
| How is cross-tenant integrity enforced? | Use paired FKs, tenant-consistency triggers, or both. |

## Current Foundation Matrix

| Area | Current state | Foundation action |
|---|---|---|
| Organizations | Backed by `tenants`; has `org_type`, `plan`, white-label flag, franchise parent. | Keep table; expose `Organization` aliases and document the mapping. |
| Branches | `branches`, `membership_branches`, branch-scoped RLS for key modules. | Replace implicit all-access with explicit scope type in a later migration. |
| Franchise | `parent_tenant_id`, `franchise_admin`, templates, activations, dashboard. | Avoid cross-tenant `branch_id` overload; introduce assigned tenant/branch fields for routing. |
| Roles | RBAC exists via `memberships.role`. | Add a central permission registry for resource/action/scope checks. |
| Teams | Task departments exist, but generic people teams do not. | Introduce canonical teams and link task departments where useful. |
| Vehicles | `vehicles` are tenant-scoped. | Decide branch assignment rules and add branch scope where operationally needed. |
| Tasks | Tenant-scoped Kanban with departments and assignment rules. | Add team/branch awareness where task ownership requires it. |
| Reporting | Tenant/franchise dashboards exist, partly live-aggregated. | Add branch/franchise aggregates or materialized reporting views. |

## Sprint Roadmap

### Sprint 0 - Canon audit and foundation alignment

Done in this branch:

- Document `tenant = Organization` as the canonical mapping.
- Add product-domain aliases for organization types.
- Include `org_type` and `parent_tenant_id` in tenant resolution paths.
- Ensure `franchise_admin` lands in `/backoffice`.

Acceptance:

- New code can refer to `Organization` without a database rename.
- Existing auth and host resolution expose enough organization metadata for later work.

### Sprint 1 - Quick hardening

Implement next:

- Add a lightweight `lib/organization` service facade for loading active organization context.
- Add tests for franchise-admin landing and organization metadata in auth bootstrap.
- Audit tenant selects and replace partial tenant columns where `org_type` or franchise state is needed.

### Sprint 2 - Organization profile and platform admin

Implement:

- Add `organization_profiles` for legal name, billing email, support email, KvK/VAT, owner, lifecycle status, and onboarding status.
- Extend platform-admin organization creation with org type, plan, owner user, and franchise relation.
- Audit every create/update in this area.

### Sprint 3 - Permissions and scope v2

Implement:

- Add a central permission registry and helper API.
- Replace implicit branch all-access with explicit `scope_type = all | branches`.
- Retrofit students, agenda, leads, tasks, vehicles, and invoices to use the same scope helper.

### Sprint 4 - Branch completeness

Implement:

- Add branch manager/contact/capacity metadata.
- Add branch-aware behavior for vehicles, locations, availability, task routing, and invoices where needed.
- Add RLS tests for scoped reads and denied cross-branch writes.

### Sprint 5 - Teams

Implement:

- Add canonical `teams` and `team_memberships`.
- Backfill default teams: Planning, Administratie, Marketing, Theorie, Examenbureau, Management.
- Link task departments to teams without breaking current Kanban boards.

### Sprint 6 - Franchise hardening

Implement:

- Add explicit franchise relationship/lifecycle state.
- Replace franchise lead routing with `assigned_tenant_id` and `assigned_branch_id`.
- Complete branch-level franchise dashboard metrics.

### Sprint 7 - Subscriptions and entitlements

Implement:

- Normalize plans and entitlements.
- Gate server actions and UI from one entitlement source.
- Add limits for branches, users, white-label, franchise, AI, and reports.

### Sprint 8 - Reporting, security, and monitoring

Implement:

- Add organization/branch/franchise reporting aggregates.
- Add CI checks for RLS, RPC grants, branch scope, and franchise sibling isolation.
- Add alerting for cron failures, auth failures, and service health.

### Sprint 9 - White-label organization polish

Implement:

- Complete tenant-branded transactional emails.
- Add an organization onboarding checklist for branding, domain, branches, teams, users, vehicles, and packages.

## Implementation Rule For New Modules

Before merging a new module, reviewers must verify:

- The module declares its organization, branch, and team behavior.
- Every table has RLS enabled unless it is intentionally private/platform-only.
- Every mutation path is server-side and audited when business-critical.
- Every cross-tenant FK is protected by paired FK or tenant-consistency trigger.
- Every report query has an explicit tenant/franchise authorization boundary.
