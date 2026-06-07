# NXTDRIVE Organization Foundation

Status: architecture foundation
Owner: platform architecture
Last updated: 2026-06-07

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
| Organizations | Backed by `tenants`; has `org_type`, `plan`, white-label flag, franchise parent, and `organization_profiles` for legal/commercial metadata. | Keep table; expose `Organization` aliases and use the profile facade for platform-admin metadata. |
| Branches | `branches`, `membership_branches`, branch-scoped RLS for key modules, and explicit `memberships.branch_scope_type`. | Retrofit every branch-aware module to consume the same scope helper. |
| Franchise | `parent_tenant_id`, `franchise_admin`, templates, activations, dashboard. | Avoid cross-tenant `branch_id` overload; introduce assigned tenant/branch fields for routing. |
| Roles | RBAC exists via `memberships.role`; routing uses one pure helper; permissions now have a central registry with manage-implies-same-resource access. | Move server pages/actions from ad hoc role arrays to resource/action permission checks. |
| Teams | Task departments exist, but generic people teams do not. | Introduce canonical teams and link task departments where useful. |
| Vehicles | `vehicles` are tenant-scoped. | Decide branch assignment rules and add branch scope where operationally needed. |
| Tasks | Tenant-scoped Kanban with departments and assignment rules. | Add team/branch awareness where task ownership requires it. |
| Reporting | Tenant/franchise dashboards exist, partly live-aggregated. | Add branch/franchise aggregates or materialized reporting views. |

## Sprint Roadmap

### Sprint 0 - Canon audit and foundation alignment

Done:

- Document `tenant = Organization` as the canonical mapping.
- Add product-domain aliases for organization types.
- Include `org_type` and `parent_tenant_id` in tenant resolution paths.
- Ensure `franchise_admin` lands in `/backoffice`.

Acceptance:

- New code can refer to `Organization` without a database rename.
- Existing auth and host resolution expose enough organization metadata for later work.

### Sprint 1 - Quick hardening

Done:

- Add `lib/organization` context facade for active organization access.
- Centralize role-to-home routing in a pure helper shared by login and denial redirects.
- Add `test-organization-foundation` to cover franchise-admin routing and metadata guardrails.
- Keep auth bootstrap and host resolution selecting `org_type` and `parent_tenant_id`.

Acceptance:

- `pnpm --filter @workspace/scripts run test-organization-foundation` passes.
- New server code can call `requireActiveOrganization` instead of speaking tenant directly.
- Future role-routing changes are made in one testable location.

### Sprint 2 - Organization profile and platform admin

Done:

- Add `organization_profiles` for legal name, billing email, support email, KvK/VAT, owner, lifecycle status, and onboarding status.
- Backfill profiles for existing tenants so the admin UI can rely on a one-to-one profile row.
- Expose `loadOrganizationProfile` and `upsertOrganizationProfile` through the organization domain facade.
- Extend platform-admin organization creation with org type, plan, owner user, lifecycle, onboarding, and optional franchise parent.
- Add a tenant-detail organization profile editor for platform admins.
- Audit profile writes through the service-role-only `upsert_organization_profile` RPC.
- Add `test-organization-profile-foundation` guardrails for schema, RLS, RPC grants, facade exports, and UI wiring.

Acceptance:

- `supabase/migrations/0098_organization_profiles.sql` creates the profile table, RLS policy, backfill, and audited RPC.
- `pnpm --filter @workspace/scripts run test-organization-profile-foundation` passes.
- Platform admins can create an organization with profile metadata and later update that metadata from the tenant detail page.

### Sprint 3 - Permissions and scope v2

Started:

- Add `lib/permissions` as the central permission registry for roles, resources, actions, and allowed scope kinds.
- Add pure branch-scope helpers for `all` versus explicit branch IDs.
- Add `requireOrganizationPermission` for new server code that needs a resource/action guard and branch scope output.
- Add `memberships.branch_scope_type` so branch access is explicit instead of inferred only from empty `membership_branches` rows.
- Keep `branch_scope_type` synchronized from `membership_branches` with a database trigger.
- Add `test-permission-foundation` guardrails for registry, scope merging, session metadata, exports, and migration contracts.
- Teach permission checks that `resource:manage` covers lower-level actions on the same resource, including `resource:read`.
- Add `loadOrganizationBranchScope` to expand branch-scoped memberships with actual `membership_branches` IDs before module filters are applied.
- Retrofit the backoffice students list to use `requireOrganizationPermission("student:read")`, expanded branch scopes, branch-limited filters, and balance queries scoped to the visible students.
- Add `requireStudentBackofficeAccess` to validate single-student staff access before dossier/service-role reads.
- Retrofit the student detail page to validate branch-scoped access before loading the 360-degree dossier.
- Retrofit `backoffice/leerlingen/actions.ts` so protected student writes validate per-student access before service-role RPC/storage/auth operations.

Acceptance for current slices:

- `supabase/migrations/0099_permission_scope_foundation.sql` adds and backfills explicit branch scope.
- `pnpm --filter @workspace/scripts run test-permission-foundation` passes.
- New server modules can call `requireOrganizationPermission("resource:action")` instead of hardcoding role arrays.
- The students list only shows students from branches inside the user's expanded organization branch scope.
- Student dossier and `leerlingen/actions.ts` writes validate the target student against the caller's expanded branch scope first.

Still required in Sprint 3:

- Complete remaining student-adjacent actions outside `backoffice/leerlingen/actions.ts`, including availability/daypart and any CBR/retake actions owned by separate modules.
- Retrofit agenda, leads, tasks, vehicles, and invoices to consume `requireOrganizationPermission` and returned branch scopes.
- Update module-specific RLS tests to assert the new explicit branch scope field remains synchronized.
- Replace ad hoc role arrays in backoffice pages/actions where the permission registry now has equivalent resource/action checks.

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
