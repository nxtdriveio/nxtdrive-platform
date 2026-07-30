# Providergateway

De interfaces `LocationProvider` en `RoutingProvider` zijn providerneutraal. Google-specifieke field masks, elementlimieten en foutvormen blijven zichtbaar in de infrastructuuradapters.

## Googleproducten

- Places API (New): Autocomplete en Place Details.
- Address Validation API.
- Geocoding API v4 voor gecontroleerde migratie.
- Routes API: Compute Route Matrix.
- Route Optimization API uitsluitend met OAuth/service identity.

Alle kostbare calls lopen server-side. De gateway:

- berekent `origins × destinations` vóór de call;
- accepteert maximaal 100 elementen per productactie;
- gebruikt een lagere configureerbare traffic-aware limiet;
- valideert ieder element, inclusief `condition`, status, duur en afstand;
- behandelt `NO_ROUTE` als `null`, nooit als nul minuten;
- vult partiële responses met expliciet gelabelde fallbacklegs;
- meet matrixelementen, niet alleen requests.

De bestaande proefles- en refillengines gebruiken `lib/trial-lessons/route.ts` als compatibility adapter naar dezelfde centrale gateway.

## Actuele primaire bronnen

- https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- https://developers.google.com/maps/documentation/places/web-service/place-session-tokens
- https://developers.google.com/maps/documentation/routes/compute_route_matrix
- https://developers.google.com/maps/documentation/routes/usage-and-billing
- https://developers.google.com/maps/documentation/route-optimization/overview

Gecontroleerd op 30 juli 2026.
