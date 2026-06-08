# Sprint 5 - Organization Management UI

Status: in progress
Roadmap position: after Sprint 4 branch completeness, before Sprint 6 manageable permissions.

## Product Canon

Organization is the highest operational customer container in NXTDRIVE. Branches, teams, users, roles, students, vehicles, planning, invoices, tasks and future AI features all live below an organization.

A branch is optional. A single-instructor school still has one organization and can operate without branches.

## Sprint 5A - Organization Management Hub

Implemented in this slice:

- Add `/backoffice/organisatie` as the canonical admin entry point for organization management.
- Expose organization profile fields for legal name, billing e-mail, support e-mail, KvK, VAT and organization owner.
- Save organization profile changes through the existing audited `upsert_organization_profile` RPC.
- Validate owner selection against staff memberships inside the current organization.
- Surface organization type, plan, lifecycle and onboarding state without making platform-owned lifecycle controls tenant-editable.
- Link directly to the existing branch management UI.
- Link directly to the existing staff invite, role and branch-scope UI.
- Show role counts so admins can sanity-check the current staff model quickly.
- Add a teams placeholder that documents the intended layer without pretending the full teams datamodel is finished.
- Add `test-organization-management-ui` static guardrails.

## Already Present Before This Slice

The current codebase already had important pieces in place:

- Organization profile table, RLS and audited upsert RPC.
- Platform-admin organization profile editing.
- Branch management UI and branch create/update actions.
- Staff invitation with temporary passwords.
- Staff roles and branch assignment through `membership_branches`.
- Foundation permissions such as `organization:update`, `branch:manage`, `team:manage` and `user:manage`.

## Remaining Sprint 5 Follow-Up

Recommended next slices:

- Sprint 5B: create the real teams datamodel and team management UI.
- Sprint 5C: connect employee invitations and memberships to optional team assignment.
- Sprint 5D: improve branch/staff/organization UX consistency after PR #31 branch UX cleanup lands.

## Boundary With Sprint 6

Sprint 5 keeps the current hardcoded permission registry intact. Sprint 6 should make roles and scoped permissions manageable through admin UI, while preserving the current registry as a safe fallback/default policy.

## Boundary With Sprint 7+

Franchise controls remain separate from regular multi-branch organization management. Sprint 7 should introduce franchise-owner views and central steering without turning franchise into just another branch model.
