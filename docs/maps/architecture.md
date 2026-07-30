# Maps-, locatie- en routearchitectuur

Status: geïmplementeerde basis, providerfuncties standaard uit.

De kern bestaat uit vier grenzen:

1. `location_records` is de stabiele NXTDrive-identiteit.
2. `location_versions` bevat immutable adresinhoud en provenance.
3. `appointment_stops` bewaart het gepubliceerde historische snapshot.
4. `domains/maps` is de enige providergrens voor Places, Routes, limieten, caching en metering.

De bestaande tabel `locations` behoudt haar operationele lescontextbetekenis. De nieuwe tabellen vervangen haar niet stil. Profielwijzigingen maken een nieuwe locatieversie en wijzigen nooit een gepubliceerde afspraakstop.

## Requestpad

```text
surface
→ authenticated NXTDrive server
→ entitlement/limit/circuit RPC
→ tenant cache
→ provideradapter
→ responsevalidatie
→ expliciete fallback
→ PII-vrije usage ledger
```

Google is nooit een harde afhankelijkheid voor kernplanning. Adresinvoer valt terug op handmatige invoer, kaarten op een lijst en routeberekening op een gelabelde Haversine-inschatting.

## Productgrenzen

- Geen live GPS, achtergrondlocatie, routeopname of interne turn-by-turn.
- Optimalisatiescenario's zijn immutable concepten met menselijke review.
- Exacte locaties zijn operationeel voor planner, toegewezen instructeur en betreffende leerling.
- Management- en platformschermen gebruiken aggregaten; platformgebruik bevat geen adresdata.

Belangrijkste code: `artifacts/nxtdrive/domains/maps/` en migraties `20260730150000` tot en met `20260730154000`.
