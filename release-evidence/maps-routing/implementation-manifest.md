# Maps & Routing implementation manifest

## Database

- `20260730150000_location_records_and_stops.sql`
- `20260730151000_maps_metering_limits.sql`
- `20260730152000_route_planning_scenarios.sql`
- `20260730153000_location_workflows_privacy.sql`
- `20260730154000_maps_feature_gate_rpc.sql`
- `20260730155000_student_stop_confirmations.sql`

All 172 migrations passed on both an empty and an existing populated disposable PostgreSQL database. The smoke executes real location versioning, snapshot publication, learner correction, learner confirmation, cross-tenant rejection, entitlement degradation, hard-limit enforcement, per-element metering and rollup.

## Application

- Provider-neutral domain and gateways: `artifacts/nxtdrive/domains/maps/`
- Student locations: `/leerling/instellingen/locaties`
- Lesson stop confirmation/correction: `/leerling/lessen/[lessonId]`
- Instructor day route: `/instructeur/dagroute`
- Planning list/map workspace: `/backoffice/planning-board/kaart`
- Tenant location operations: `/backoffice/locaties`
- Platform Control Center: `/platform/maps`
- Tenant feature/limit detail: `/platform/maps/tenants/[tenantId]`

## Security and privacy

- Provider code is server-only and uses bounded timeouts and field masks.
- The usage ledger rejects address, coordinate and person fields by schema design.
- Credentials are external secret references, split by role and environment.
- Current global CSP remains nonce-based without `unsafe-eval`.
- Exact map rendering is not active until the isolated `maps.nxtdrive.io` origin is deployed and reviewed.
- Privacy export includes canonical versions, published stops, proposals, confirmations, validation and travel status.
- Anonymization removes direct location relations, proposals, confirmations and orphaned canonical records while reporting retained historical snapshots honestly.

## Activation state

Every Google-backed entitlement defaults to disabled. Manual address entry, list planning, external navigation handoff and labeled internal estimates remain available. Google project setup, credentials, billing, EEA terms review, isolated map origin and a tenant pilot are external release actions.
