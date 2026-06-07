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
- Add branch selection to the task dialog, including an `Alle vestigingen` shared option for organization-wide managers.
- Scope task entity search by branch for students, leads, lessons, exams, and invoices.
- Add `test-task-branch-foundation` static guardrails for migration, page access, UI, actions, search, and type coverage.

## Remaining Follow-Up

Next recommended slices:

- Add database/RLS integration tests for cross-branch vehicle/location and task read/write denial.
- Reuse the `branch_id = null` shared-asset convention consistently in planning screens.
- Decide whether branch managers should receive scoped `vehicle:manage` and `task:manage` in the permission registry or remain read-only for those modules.
- Continue Sprint 4 with invoice branch scope and availability/location branch behavior.
