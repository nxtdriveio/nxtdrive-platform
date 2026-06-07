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

## Remaining Follow-Up

Next recommended slices:

- Add database/RLS integration tests for cross-branch vehicle/location read and write denial.
- Reuse the `branch_id = null` shared-asset convention consistently in planning screens.
- Decide whether branch managers should receive scoped `vehicle:manage` in the permission registry or remain read-only for assets.
- Continue Sprint 4 with task routing, invoice branch scope, and availability/location branch behavior.
