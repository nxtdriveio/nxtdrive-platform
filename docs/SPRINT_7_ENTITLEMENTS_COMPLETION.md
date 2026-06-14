# Sprint 7 - Entitlements Completion

Status: in progress  
Roadmap position: Stream 3 - subscriptions, entitlements and downgrade behavior

## Goal

Maak entitlement- en downgradegedrag commercieel eenduidig en server-side
betrouwbaar:

- één vers entitlement-snapshotmodel vanuit de database,
- geen losse planchecks die op mogelijk verouderde sessiedata vertrouwen,
- expliciet verschil tussen:
  - uitbreiding blokkeren,
  - bestaande configuratie read-only tonen,
  - bestaande configuratie nog kunnen opschonen om terug binnen limiet te komen.

## Implemented in this slice

- Added `loadTenantEntitlementTenant` and `loadTenantEntitlementSnapshot` in
  `lib/platform/entitlements.ts` as the canonical server-side commercial state.
- Added `getTenantFeatureAccess` so feature gating and white-label activation
  checks come from one helper instead of ad-hoc plan comparisons.
- Added `canManageExistingBranches` to support downgrade cleanup behavior:
  existing vestigingen remain manageable for correction/downscaling even when
  the tenant no longer qualifies for new multi-branch expansion.
- Migrated the following server actions to the shared entitlement snapshot:
  - branch create/update/scope actions,
  - staff invite limit enforcement,
  - branding and custom-domain actions,
  - tenant notification template white-label enforcement,
  - AI package advice and instructor AI actions,
  - advanced reports gating,
  - franchise template, distribution and lead-routing actions.
- Updated tenant backoffice pages to surface the fresh entitlement state more
  consistently:
  - instellingen,
  - abonnement,
  - medewerkers,
  - vestigingen,
  - membership branch-scope page,
  - shared backoffice layout alert count,
  - franchise dashboard, playbook, planning, prestaties, aandacht, vergelijking
    and template pages.
- Extended commercial surfacing and server enforcement to remaining export and
  package-adjacent surfaces:
  - rapportage CSV export now requires `advanced_reports` server-side,
  - boekhouding factuur-, betaling- and klantenexports require
    `advanced_reports` server-side,
  - boekhouding remains readable for baseline finance follow-up while export
    controls show a clear locked state,
  - franchisee package-template activation is surfaced as read-only when the
    tenant no longer has `franchise_as_franchisee`.

## Canon Decisions Clarified

### Branch downgrade behavior

When a tenant drops below `multi_branch`:

- new vestigingen stay blocked,
- existing vestigingen stay visible,
- existing vestigingen may still be corrected or deactivated so the tenant can
  return to a compliant shape,
- branch-scope on medewerkers may still be updated for the same cleanup reason.

This avoids a downgrade dead-end where the tenant cannot clean up its own
over-limit structure.

### White-label downgrade behavior

When a tenant drops below Elite:

- existing branding and custom-domain state remain visible,
- themed shells stop qualifying as active white-label unless the feature is
  eligible again,
- branding/template/domain mutations remain blocked where the product calls for
  read-only downgrade behavior.

### Franchise downgrade behavior

When a tenant loses franchisegever access but already has franchisees:

- the franchise cockpit remains visible,
- governance, planning and comparison pages stay readable,
- template distribution and activation controls become read-only,
- new franchise roll-out actions stay blocked until the required plan returns.

This avoids hiding an existing network while still enforcing the commercial
boundary for expansion.

### AI and reporting gates

AI and reporting features now rely on a fresh entitlement snapshot loaded from
the database instead of only the request/session tenant object. This makes
package advice, instructor AI tooling and advanced reports react consistently to
recent plan changes.

### Commercial export gates

Finance and reporting CSV exports are treated as advanced reporting output.
The underlying operational modules stay available on Start where they are part
of the baseline product, but bulk export routes now return `403 plan_required`
without the required plan. This prevents direct URL bypasses while keeping
day-to-day invoicing and bookkeeping visible.

## Remaining follow-up after this slice

- Run the separate go-live pass for performance, session retention and
  production hardening.
- Add deeper downgrade behavior for future numeric limits beyond branches,
  staff and custom domains.
- Add E2E coverage for downgrade scenarios and plan-change refresh behavior.
