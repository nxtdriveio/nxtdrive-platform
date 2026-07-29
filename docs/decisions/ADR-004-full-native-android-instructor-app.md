# ADR-004 — Full-native Android instructeursapp

- Status: accepted
- Date: 2026-07-29
- Supersedes: de eerdere Capacitor-containerkeuze voor de Android-instructeursapp

## Context

De eerste Play-releasevoorbereiding hergebruikte de webapp via Capacitor. De
opdrachtgever heeft daarna expliciet gekozen voor een full-native Android-app en
betrouwbaar ingelogd sessiebeheer. Een WebView-container zou daarmee een
onnodige tweede authenticatiecontext, bridge-oppervlak en assetpipeline
behouden.

## Decision

`NXTDRIVE Instructeur` wordt zelfstandig gebouwd met Kotlin, Jetpack Compose,
Material 3, AndroidX Navigation en OkHttp. De production-AAB bevat geen
Capacitor-runtime, bridgeclasses, HTML of gekopieerde webapp-assets.

De native app gebruikt versieerbare JSON-routes onder `/api/mobile/`. Iedere
route valideert het Bearer-token opnieuw en leidt gebruiker, tenant, rollen en
vestigingsscope server-side af voordat de service-role client wordt gebruikt.
Een tenantheader selecteert alleen binnen reeds bewezen lidmaatschappen en kan
geen toegang verlenen.

Access-token, roterend refresh-token, vervaltijd en actieve tenant worden als
één AES-GCM-payload opgeslagen. De niet-exporteerbare sleutel staat in Android
Keystore. Refreshes zijn met één mutex geserialiseerd; gelijktijdige expiry- of
`401`-reacties kunnen hetzelfde refresh-token daardoor niet parallel roteren.
Een tijdelijke netwerkfout behoudt de lokale sessie. Een ingetrokken
refresh-token of ingetrokken instructeurstoegang wist de lokale sessie.

De app ondersteunt zowel uitloggen op dit apparaat als globale uitlog. Android
backup en cleartextverkeer blijven uitgeschakeld.

## Consequences

- Native schermen en mobiele API-contracten moeten samen worden onderhouden.
- Webcookies en browseropslag zijn geen onderdeel van de Android-sessie.
- De releaseworkflow bouwt alle varianten, compileert toesteltests, inspecteert
  de AAB op legacy webassets/bridgeclasses en promoveert exact de intern geteste
  production-AAB.
- App-links blijven afhankelijk van de Play App Signing-fingerprint in
  `/.well-known/assetlinks.json`.
- Storebeelden en handmatige acceptatietests moeten de geïnstalleerde native
  app representatief weergeven.
