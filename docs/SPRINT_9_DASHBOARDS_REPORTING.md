# Sprint 9 - Dashboards & Rapportages

Sprint 9 brengt een expliciete managementlaag bovenop de bestaande operationele modules.

## Doel

- een organisatiecockpit voor centrale sturing
- een vestigingsdashboard voor lokale operatie
- een steviger franchise-dashboard voor netwerksturing
- consistente KPI-taal rond omzet, ritme, conversie en opvolging

## Wat is toegevoegd

- `artifacts/nxtdrive/lib/dashboard/management.ts`
  Gedeelde loader voor organisatie- en vestigingsmetrics.
- `artifacts/nxtdrive/app/backoffice/organisatie/dashboard/page.tsx`
  Organisatiedashboard met vestigingsritme en centrale signalen.
- `artifacts/nxtdrive/app/backoffice/instellingen/vestigingen/[branchId]/dashboard/page.tsx`
  Vestigingsdashboard met lokale KPI's en watchlist.
- `artifacts/nxtdrive/app/backoffice/franchise/page.tsx`
  Franchisecockpit uitgebreid met netwerkgezondheid en managementsignalen.

## Productkeuze

Sprint 9 bouwt geen los analytics-product naast het platform.

In plaats daarvan komt er een managementlaag die:

- direct boven de bestaande operatie hangt
- dezelfde datamodellen gebruikt
- vestiging, organisatie en franchise in dezelfde taal laat sturen

## KPI-canon

De dashboards sturen primair op:

- omzet laatste 30 dagen
- geplande lessen komende 7 dagen
- leadconversie laatste 30 dagen
- actieve leerlingen
- leerlingen zonder vervolgles
- vestigingen zonder gepland ritme
- vestigingen zonder toegewezen medewerkerscope

## Waarom dit belangrijk is

De eerdere sprints legden de structuur, permissies en franchisefundering.

Sprint 9 maakt die fundering bestuurbaar:

- organisatie kan zien waar ritme wegvalt
- vestiging kan zien waar directe opvolging nodig is
- franchisegever kan netwerkbreed sturen zonder multi-vestiging te verwarren met franchise
