# Planning Core Schema Plan

Status: step 2 schema design for the central planning kernel

## Goal

This document translates the planning-core canon into a schema plan that fits
the database that already exists today.

The main design choice is:

> extend existing tenant/branch/franchise structures instead of introducing a
> parallel planning-specific ownership model.

That keeps the future planning kernel aligned with:

- `tenants`
- `branches`
- `memberships`
- `membership_branches`
- `lessons`
- `trial_lessons`
- `agenda_appointments`
- `vehicles`
- `locations`
- `instructor_availability`
- `instructor_availability_exception`
- `audit_log`

## Existing foundations we keep

### Vehicles and locations

Already present:

- `public.vehicles`
- `public.locations`

Current state:

- tenant-scoped
- branch-aware (`branch_id` added later)
- already used by lesson context

Decision:

- keep both tables as the canonical asset/location catalog
- extend `vehicles` with operational planning metadata instead of replacing it

### Instructor availability

Already present:

- `public.instructor_availability`
- `public.instructor_availability_exception`

Current state:

- recurring weekly windows
- date exceptions
- overlap-safe via exclusion constraints
- RPC-managed writes

Decision:

- keep these as the canonical source of truth for availability
- extend them with optional `branch_id` for branch-aware visibility and future
  delegation rules

### Planning entities

Already present:

- `public.lessons`
- `public.trial_lessons`
- `public.agenda_appointments`

Decision:

- keep all three
- add the missing planning anchors that the central kernel needs:
  - `vehicle_id` where missing
  - `location_id` where missing
  - `pickup_service_area_id`

## Franchise model decision

The current franchise layer does **not** have a separate `network_id` table.
Instead it models a network as:

- a franchise root tenant
- franchisee tenants linked through `tenants.parent_tenant_id`

Decision:

- represent franchise-network scope with the **root tenant id**
- use `franchise_root_tenant_id` where a schema object needs explicit network
  context
- do not invent a parallel `franchise_networks` table in this phase

This keeps the planning kernel consistent with the existing franchise module.

## New schema that must be added

### Vehicle operations

Extend `public.vehicles` with:

- `brand`
- `model`
- `vehicle_type`
- `status`
- `apk_expires_at`
- `insurance_expires_at`
- `current_odometer_km`
- `default_instructor_id`
- `notes`

Add new tables:

- `public.vehicle_odometer_entries`
- `public.vehicle_damage_reports`
- `public.vehicle_maintenance_events`

### Service areas / rayons

Add:

- `public.service_areas`
- `public.service_area_zones`
- `public.instructor_service_area_assignments`
- `public.service_area_travel_matrix`

Decision:

- service areas are tenant-owned for now
- franchise roots can later publish templates from their own tenant
- no polygon/GIS model in V1; areas are defined through zone descriptors

### Capabilities

Add:

- `public.capability_definitions`
- `public.instructor_capabilities`
- `public.vehicle_capabilities`
- `public.student_requirements`

Decision:

- definitions are tenant-owned
- future franchise publishing can build on top of root-tenant-owned definitions
- values are boolean in V1

### Planning queue

Add:

- `public.planning_queue_items`

Decision:

- queue items stay tenant/branch scoped
- queue items may point to either a `student_id`, a `lead_id`, or neither for
  pure internal planning work
- required/preferred capability references live as JSON arrays in V1 so the
  queue can move before a richer join-table model is needed

### Planning audit

Add:

- `public.planning_audit_log`

Decision:

- `audit_log` remains the global immutable business log
- `planning_audit_log` becomes the planning-specific event stream with:
  - before/after snapshots
  - scope metadata
  - override reasons
  - delegated franchise mutations

### Franchise operations permissions

Add:

- `public.franchise_operations_permissions`

Decision:

- one row per `(franchise_root_tenant_id, franchisee_tenant_id)`
- controls whether central franchise operations may only observe or also mutate

## Tables we extend in this phase

### `public.lessons`

Add:

- `pickup_service_area_id`

Already present:

- `vehicle_id`
- `location_id`
- `branch_id`

### `public.trial_lessons`

Add:

- `vehicle_id`
- `location_id`
- `pickup_service_area_id`

Already present:

- `branch_id`
- route coordinates and route-travel insight

### `public.agenda_appointments`

Add:

- `vehicle_id`
- `location_id`
- `pickup_service_area_id`

Why:

- these appointments already block the schedule
- the future kernel must validate them against the same vehicle/rayon rules as
  lessons and trials

## Security model

For the new tables in this foundation step:

- `SELECT` stays tenant-scoped via RLS
- writes stay behind service-role/server actions only
- no direct client insert/update/delete policies are introduced

For `franchise_operations_permissions`:

- franchise root admins and franchisee admins may read the row
- platform admin may read the row
- writes remain server-side only

## Deliberate non-goals in this schema step

Not in this migration yet:

- the central planning kernel functions
- a drag-and-drop planner
- automatic route optimization across the network
- polygon/GIS rayons
- capability scoring logic
- queue-to-appointment orchestration

This step is only about putting the right tables and columns in place so step 3
can be built on solid ground.

## Implementation sequence after this step

1. Schema foundation migration
2. Central planning kernel
3. Rewire the existing write paths to the kernel
4. Availability UI
5. Vehicle UI
6. Rayon UI
7. Capability UI
8. Planning queue + drag/drop planner
9. Franchise delegation and planning audit completion
