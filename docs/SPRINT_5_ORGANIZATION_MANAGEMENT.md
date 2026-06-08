# Sprint 5 - Organization Management UI

Status: in progress
Roadmap position: after Sprint 4 branch completeness, before Sprint 6 manageable permissions.

## Product Canon

Organization is the highest operational customer container in NXTDRIVE. Branches, teams, users, roles, students, vehicles, planning, invoices, tasks and future AI features all live below an organization.

A branch is optional. A single-instructor school still has one organization and can operate without branches.

Teams are configurable departments inside the organization. Team membership is structural and operational. It is not a replacement for RBAC roles or branch scope.

## Sprint 5A - Organization Management Hub

Implemented in this slice:

- Add `/backoffice/organisatie` as the canonical admin entry point for organization management.
- Expose organization profile fields for legal name, billing e-mail, support e-mail, KvK, VAT and organization owner.
- Save organization profile changes through the audited `upsert_organization_profile` RPC, scoped so tenant/franchise admins can update their own organization only.
- Validate owner selection against staff memberships inside the current organization.
- Surface organization type, plan, lifecycle and onboarding state without making platform-owned lifecycle controls tenant-editable.
- Link directly to the existing branch management UI.
- Link directly to the existing staff invite, role and branch-scope UI.
- Show role counts so admins can sanity-check the current staff model quickly.
- Add `test-organization-management-ui` static guardrails.

## Sprint 5B - Teams Foundation

Implemented in this slice:

- Add `organization_teams` for configurable departments such as Planning, Administratie, Marketing, Theorie and Management.
- Add `organization_team_members` for linking existing staff memberships to teams.
- Keep teams organization-wide by default with optional `branch_id` for branch-specific teams.
- Add branch/tenant validation triggers so a team cannot point at another organization's branch.
- Add member validation triggers so team members must be staff memberships inside the same organization.
- Enable RLS and explicit Supabase Data API grants for team reads.
- Keep writes behind service-role-only audited RPCs: `create_organization_team`, `update_organization_team`, `set_organization_team_members`.
- Add `/backoffice/organisatie/teams` for creating, editing, scoping and populating teams.
- Replace the organizationhub teams placeholder with live team counts and a teams management link.
- Add a direct Beheer sidebar entry for Teams.
- Add `test-organization-teams-foundation` static guardrails.

## Sprint 5C - Staff Team Assignment

Implemented in this slice:

- Extend the staff invite flow so tenant admins can optionally assign one or more teams while inviting a medewerker.
- Keep the temporary-password onboarding flow intact for new staff accounts.
- Keep branch scope and role assignment intact while adding team assignment as an operational layer.
- Add audited RPC usage through `set_membership_organization_teams` so writes stay tenant-safe and branch-compatible.
- Roll back membership creation if team assignment fails, so we never leave half-configured staff access behind.
- Add `/backoffice/medewerkers/[membershipId]/teams` for per-medewerker teambeheer.
- Show current team assignments in the medewerkers overview table.
- Add `test-staff-team-assignment-foundation` static guardrails.

## Sprint 5D - Management UX Consistency

Implemented in this slice:

- Align organization, branches, teams and staff screens so they share the same management language and visual rhythm.
- Add summary stat cards to core management pages for quicker operational scanning.
- Add cross-links between organization, vestigingen, teams and medewerkers so admins always see the next logical step.
- Improve empty states so optional structure is explained clearly instead of feeling like a missing setup step.
- Clarify upgrade/read-only messaging around multi-branch where relevant.
- Add an operational readiness checklist to the organization hub.
- Add `test-organization-management-ux-consistency` static guardrails.

## Already Present Before Sprint 5

The codebase already had important pieces in place:

- Organization profile table, RLS and audited upsert RPC.
- Platform-admin organization profile editing.
- Branch management UI and branch create/update actions.
- Staff invitation with temporary passwords.
- Staff roles and branch assignment through `membership_branches`.
- Foundation permissions such as `organization:update`, `branch:manage`, `team:manage` and `user:manage`.

## Remaining Sprint 5 Follow-Up

Recommended next slices:

- Sprint 6: make roles and scoped permissions beheerbaar via admin UI in plaats van alleen hardcoded registry-defaults.

## Boundary With Sprint 6

Sprint 5 keeps the current hardcoded permission registry intact. Sprint 6 should make roles and scoped permissions manageable through admin UI, while preserving the current registry as a safe fallback/default policy.

## Boundary With Sprint 7+

Franchise controls remain separate from regular multi-branch organization management. Sprint 7 should introduce franchise-owner views and central steering without turning franchise into just another branch model.
