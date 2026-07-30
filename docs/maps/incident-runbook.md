# Incident-runbook Maps & Routing

## Mogelijke incidenten

- providercredential of adresdata gelekt;
- sterke fout- of latencytoename;
- onverwachte kostenstijging;
- verkeerde tenanttoegang;
- foutieve routepublicatie;
- uitgevallen metering of rollups.

## Respons

1. Beperk impact: deactiveer entitlement of open de circuitbreaker zonder kernplanning uit te schakelen.
2. Bewaar audit-, usage- en requestcorrelatiegegevens; kopieer geen PII naar tickets.
3. Roteer credentials wanneer blootstelling aannemelijk is.
4. Bepaal tenants, tijdvakken en functies via pseudonieme identifiers.
5. Herstel vanuit immutable scenario's en mutatieaudit; draai alleen expliciet toegepaste wijzigingen terug.
6. Reconcilieer gemiste usage en label correcties.
7. Documenteer oorzaak, detectie, impact, herstel en preventie.

Een privacy- of beveiligingsincident volgt aanvullend het centrale NXTDrive meld- en AVG-proces.
