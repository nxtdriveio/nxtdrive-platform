# ADR-012 — Privacygrens voor locatieanalytics

- Status: accepted
- Date: 2026-07-30

## Context

Locatiegegevens kunnen personen en gedrag onthullen. Management heeft patronen nodig, geen individuele routecontrole.

## Decision

Operationele rollen zien exacte locaties uitsluitend binnen hun taak. Analytics gebruikt gebiedsaggregaten, minimumgroepsgroottes en suppressie. Volledige postcodes, huisnummers, vrije adresregels en coördinaten komen niet in usage- of managementdatasets. Medewerkerranglijsten zijn verboden.

## Consequences

Sommige kleine segmenten tonen bewust geen resultaat. Onderliggende operationele audit blijft alleen voor bevoegde incident- en privacyprocessen beschikbaar.

