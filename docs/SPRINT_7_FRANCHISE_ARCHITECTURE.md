# Sprint 7A - Franchise Foundation

Sprint 7 bouwt voort op de bestaande franchise-feature flags en templateflow,
maar maakt de franchisecockpit expliciet anders dan gewone multi-vestiging.

## Wat deze slice toevoegt

- Gedeelde franchise-contextservice voor franchisegever + franchisees.
- Centrale planning als read-only franchise-overzicht over alle gekoppelde tenants.
- Franchisevergelijking voor benchmarking op omzet, conversie, bezetting en slagingspercentage.
- Duidelijke navigatie en copy die uitlegt dat franchise tenant-overstijgend is
  en dus niet hetzelfde als branch-management binnen één organisatie.

## Canonieke grenzen

- Geen cross-tenant mutaties vanuit franchise-overzicht of centrale planning.
- Franchisegever krijgt inzicht, vergelijking en routing-signalen.
- Lokale uitvoering blijft bij franchisee, vestigingsmanager of planner.
- Multi-vestiging blijft branch-scoped binnen één tenant; franchise blijft een
  laag erboven met meerdere zelfstandige tenants.

# Sprint 7B - Franchise Performance Cockpit

Sprint 7B verdiept de franchisecockpit met een gedeelde access-guard en een
read-only prestatieslaag over 90 dagen.

## Wat deze slice toevoegt

- Gedeelde `requireFranchiseOperator()` guard voor alle franchisegever-pagina's.
- Nieuwe pagina `/backoffice/franchise/prestaties` met omzet-, lesvolume- en aandachtstrends.
- Netwerkbreed overzicht van franchisees met omzetdelta, lesdelta, capaciteit,
  conversie en slagingspercentage.
- Sidebar- en dashboard-links zodat prestaties, planning en vergelijking één
  samenhangende franchise-routing vormen.

## Canon voor 7B

- Franchiseprestatie is tenant-overstijgende sturing, geen operationele
  mutatieruimte binnen franchisees.
- Eerst netwerkbrede signalen, daarna lokale opvolging binnen franchisee of
  vestiging.
- De gedeelde franchise-guard voorkomt dat losse pagina's hun eigen afwijkende
  toegangslogica gaan voeren.

## Volgende logische stappen binnen Sprint 7

- Eventuele read-only drill-downs voor agenda, capaciteit en KPI-trends verder uitdiepen.
- Strakkere franchise-scope guards voor eventuele toekomstige acties.
- Franchise-specifieke dashboards later combineren met centrale leadverdeling en coachingflows.
