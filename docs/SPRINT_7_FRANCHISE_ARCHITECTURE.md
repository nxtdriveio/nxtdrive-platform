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

# Sprint 7C - Franchise Attention Center

Sprint 7C voegt een centrale aandacht-cockpit toe boven op prestaties,
vergelijking en planning, zodat franchisegevers expliciet kunnen prioriteren
welke franchisees eerst coaching, lokale planning of marketing-opvolging nodig
hebben.

## Wat deze slice toevoegt

- Nieuwe pagina `/backoffice/franchise/aandacht` als opvolgmatrix voor het hele netwerk.
- Gedeelde aandacht-metadata in de performance-loader: prioriteit, follow-up route en volgende stap.
- Koppeling tussen dashboard, prestaties, planning en vergelijking zodat alle franchise-cockpits dezelfde opvolgroute gebruiken.
- Nieuwe high-priority watchlist voor franchisees die direct centrale aandacht nodig hebben.

## Canon voor 7C

- Prioriteren mag tenant-overstijgend zichtbaar zijn, uitvoeren blijft lokaal of via coaching.
- Franchise-aandacht bepaalt geen automatische cross-tenant mutaties.
- Planning, kwaliteit, marketing en coaching blijven aparte opvolgroutes binnen dezelfde franchise-governance.

# Sprint 7D - Franchise Governance Wrap-up

Sprint 7D rondt de franchise-architectuur af met één bestuurlijke ingang boven
op aandacht, prestaties, planning en templates.

## Wat deze slice toevoegt

- Nieuwe pagina `/backoffice/franchise/playbook` als governance- en rolloutcockpit.
- Gedeelde governance-loader die template-adoptie, high-priority signalen,
  planningsgaten en vestigingsbasis samenvoegt.
- Dashboard, sidebar en templatebeheer verwijzen nu consistent naar één
  franchise-playbook in plaats van losse cockpit-eindpunten.
- Templatebeheer toont nu ook adoptie- en governance-context zodat commerciële
  standaardisatie binnen dezelfde franchisecanon blijft vallen.

## Canon voor 7D

- Franchise-playbook is een read-only stuurlaag; het activeert geen automatische cross-tenant workflows.
- Governance betekent: netwerkbreed prioriteren, lokaal uitvoeren, en centrale standaarden via templates uitrollen.
- Templates, aandacht, prestaties en planning zijn nu geen losse features meer maar één franchise-operating model.

## Sprint 7 status

Sprint 7 levert nu het volledige franchise-fundament op:
- franchise dashboard
- centrale planning
- vergelijking
- prestaties
- aandacht
- templates
- governance playbook

Hiermee is de franchise-architectuur klaar voor latere uitbreidingen zoals leadverdeling, coachingflows en franchise-dashboards in Sprint 9.
