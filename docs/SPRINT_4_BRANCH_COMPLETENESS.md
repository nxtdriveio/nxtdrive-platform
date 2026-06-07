# Sprint 4 - Branch Completeness

Status: started
Owner: platform architecture

Sprint 4 applies the organization/branch permission foundation from Sprint 3 to the remaining operational modules.

## Sprint 4A - Vehicles and Locations

Implemented in this slice:

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

## Deliberate Limit

This slice does not change the existing `upsert_vehicle`, `set_vehicle_active`, `upsert_location`, or `set_location_active` RPC signatures. New assets created from the current UI remain shared organization assets until a branch-assignment write flow is added.

Reason: this session does not have a browsable local clone or GitHub tree access for the original RPC migration definitions, so changing existing function signatures here would be higher risk than the rest of the slice.

## Sprint 4B Follow-Up

Next recommended slice:

- Add explicit branch assignment controls for vehicles and locations.
- Extend the relevant RPCs or add focused branch-assignment RPCs.
- Add database/RLS tests for cross-branch read and write denial.
- Reuse the `branch_id = null` shared-asset convention consistently in planning screens.
