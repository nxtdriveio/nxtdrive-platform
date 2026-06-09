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

## Volgende logische stappen binnen Sprint 7

- Centrale franchise-rapportages verder uitdiepen.
- Eventuele read-only drill-downs voor agenda, capaciteit en KPI-trends.
- Strakkere franchise-scope guards voor eventuele toekomstige acties.
