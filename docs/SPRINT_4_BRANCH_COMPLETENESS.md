# Sprint 4 - Branch Completeness

Status: in progress
Owner: platform architecture

Sprint 4 applies the organization/branch permission foundation from Sprint 3 to the remaining operational modules.

## Sprint 4A - Vehicles and Locations

Implemented:

- Add nullable `branch_id` to `vehicles` and `locations`.
- Treat `branch_id = null` as a shared organization-wide vehicle/location.
- Add tenant-consistency triggers so assigned branches must belong to the same organization.
- Add tenant/branch indexes for scoped reads.
- Extend `Vehicle` and `Location` types with `branch_id`.
- Extend `loadVehicles` and `loadLocations` with optional branch filters and shared-row inclusion.
- Move `/backoffice/voertuigen` from `requireActiveTenant(["tenant_admin"])` to `requireOrganizationPermission("vehicle:read")`.
- Hide create/toggle controls unless the caller has `vehicle:manage`.
- Move vehicle/location server actions to `requireOrganizationPermission("vehicle:manage")`.
- Add `test-vehicle-branch-foundation` static guardrails.

## Sprint 4B - Explicit Branch Assignment

Implemented in this slice:

- Add focused `assign_vehicle_branch` and `assign_location_branch` RPCs.
- Keep the existing `upsert_vehicle`, `set_vehicle_active`, `upsert_location`, and `set_location_active` RPC signatures unchanged.
- Grant the assignment RPCs only to `service_role`.
- Validate in app code that the caller has `vehicle:manage` before invoking the RPCs.
- Validate target branch scope before assigning a non-null `branch_id`.
- Add branch assignment dropdowns to the vehicle and location table rows.
- Preserve `branch_id = null` as the shared asset option labelled `Alle vestigingen`.
- Extend `test-vehicle-branch-foundation` to cover assignment actions, UI, and RPC migration.

## Sprint 4C - Task Branch Scope

Implemented in this slice:

- Add nullable `branch_id` to `task_boards` and `tasks`.
- Treat `branch_id = null` as an organization-wide shared board or task.
- Add tenant/branch indexes for scoped task reads and assignee reads.
- Add tenant-consistency triggers so task branches must belong to the same organization.
- Add a service-role-only `assign_task_branch` RPC for branch reassignment without changing the existing task RPC signatures.
- Extend task board and task TypeScript types with `branch_id`.
- Move `/backoffice/taken` from tenant-admin-only access to `task:read` permission checks.
- Add branch filter chips to the tasks page using the caller's organization branch scope.
- Scope board and task reads by permitted branches, including shared organization rows where appropriate.
- Split read and manage behavior so read-only task users can view boards without dragging, editing, archiving, or linking entities.
- Require `task:manage` for task create, update, move, archive, and link/unlink actions.
- Validate the caller's target branch scope before assigning or changing a task branch.
- Validate task board and column branch scope before create, update, and move mutations.
- Default branchless task launcher submissions to the caller's single allowed branch when the caller is branch-scoped.
- Add branch selection to the task dialog, including an `Alle vestigingen` shared option for organization-wide managers.
- Scope task entity search by branch for students, leads, lessons, exams, and invoices.
- Add `test-task-branch-foundation` static guardrails for migration, page access, UI, actions, search, and type coverage.

## Sprint 4D - Invoice and Payment Branch Scope

Implemented in this slice:

- Add nullable `branch_id` to `invoices`, `installment_plans`, and `payment_records`.
- Backfill invoice and installment plan branch scope from the billed student's branch.
- Backfill payment branch scope from the related invoice.
- Add tenant/branch indexes for invoice, installment plan, and payment reporting.
- Add tenant/branch consistency triggers that keep invoice branches aligned with student branches and payment branches aligned with invoice branches.
- Extend the `Invoice` TypeScript type with `branch_id`.
- Add centralized invoice backoffice access helpers for `invoice:read`, `invoice:manage`, branch filtering, target-student validation, and target-invoice validation.
- Add scoped `invoice:read` grants for branch managers and instructors while keeping `invoice:manage` limited to organization admins, franchise admins, and administration staff.
- Move `/backoffice/facturen` from role checks to invoice permission checks with branch filter chips.
- Hide create and payment controls unless the caller has `invoice:manage`.
- Scope new invoice and installment invoice student pickers to the caller's allowed branches.
- Guard create, line, draft update, credit note, manual payment, status, and Mollie payment actions before service-role RPCs run.
- Add `test-invoice-branch-foundation` static guardrails for permissions, migration, list/detail/form pages, server actions, and Mollie actions.

## Remaining Follow-Up

Next recommended slices, in exact roadmap order:

- Sprint 4E: Availability, instructor resources, planning resources, and branch-aware resource filtering.
- Sprint 4F: Database/RLS integration tests for cross-branch denial across vehicles, tasks, invoices, agenda, and planning resources.
- Sprint 4G: Branch UX cleanup so selectors, empty states, read-only states, and error messages are consistent across all scoped modules.
- Sprint 5: Organization management UI for organization profile, branches, teams, users, roles, and invitations.
- Sprint 6: Manageable RBAC and scoped permission administration.
- Sprint 7: Franchise architecture and franchise-level dashboards/planning visibility.
- Sprint 8: White-label foundation for branding, domains, colors, and app-shell configuration.
- Sprint 9: Organization, branch, and franchise dashboards and reporting.
- Sprint 10: Student, instructor, and backoffice app polish.
- Sprint 11: AI readiness data contracts for matching, planning, capacity, and franchise analysis.
- Sprint 12: Hardening, release quality, security audit, monitoring, and rollback discipline.
