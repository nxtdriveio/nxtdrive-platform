# Maps security

## Credentials

De registry `maps_credential_registry` bevat alleen secret-referenties, eigenaar, restricties, APIscope en rotatiedatum. Geheimen staan uitsluitend in de secret store/runtimeomgeving.

Vereiste scheiding:

- local, staging en production;
- browser, Android en server;
- Places/Validation/Routes en Route Optimization;
- browser origin restriction, Android package + SHA-1 en server API-restricties.

Providerbestanden beginnen met `import "server-only"`. Een automatische test scant dat geen clientcomponent naar `infrastructure/google` importeert en dat servermodules geen `NEXT_PUBLIC_` credential lezen.

## Invoer en misbruik

- Providerendpoint is authenticated en tenant-scoped.
- Publieke en ingelogde providerrequests hebben distributed rate limiting.
- Correlation IDs hebben een beperkte syntaxis.
- Matrixgrootte komt nooit uit een onbegrensde clientpayload.
- Timeouts, circuit breakers, hard limits en kill switches voorkomen retry- of matrixexplosies.

## Logging

Usage-, error- en auditlogs bevatten geen adres, postcode/huisnummer, query, coördinaten, Place ID, polyline, session token, API-key, leerlingnaam, telefoon of e-mail.
