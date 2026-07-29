# Native Android release-runbook

## Architectuur

`NXTDRIVE Instructeur` is een zelfstandige Android-app in Kotlin en Jetpack
Compose. De release bevat geen Capacitor-runtime, WebView of gekopieerde
webapp-assets.

De eerste release-identiteit is:

```text
versionName: 1.0.0
versionCode: 202607291
```

`202607291` is gereserveerd voor de eerste lokaal geverifieerde 1.0.0-bundel.
De interne workflow gebruikt bij een leeg invoerveld altijd een code boven deze
waarde. Controleer vóór de eerste Play-upload alsnog de hoogste code van een
eventueel bestaand package. Een eenmaal geüploade code wordt nooit opnieuw
gebruikt, ook niet wanneer de bytes, signing of track verschillen.

| Variant    | Application ID                    | Standaard-API                 | Signing                         |
| ---------- | --------------------------------- | ----------------------------- | ------------------------------- |
| debug      | `io.nxtdrive.instructeur.debug`   | `https://staging.nxtdrive.io` | lokale Android-debugkey         |
| staging    | `io.nxtdrive.instructeur.staging` | `https://staging.nxtdrive.io` | lokale debugkey, alleen dry-run |
| production | `io.nxtdrive.instructeur`         | `https://nxtdrive.io`         | verplichte Play-uploadkey       |

Belangrijkste technische keuzes:

- Kotlin `2.2.20` en Compose BOM `2025.10.01`;
- Material 3-schermen en adaptieve telefoon/tabletnavigatie;
- OkHttp `5.3.0` voor TLS-netwerkverkeer;
- `minSdk=24`, `compileSdk=36` en `targetSdk=36`;
- production gebruikt R8-minification en resource shrinking;
- cleartextverkeer en Android-back-ups zijn uitgeschakeld.

De API-hosts kunnen per build worden overschreven:

```text
NXTDRIVE_ANDROID_STAGING_API_BASE_URL
NXTDRIVE_ANDROID_API_BASE_URL
```

Beide waarden moeten `https` gebruiken. De production-API moet vóór distributie
van de AAB de routes onder `/api/mobile/` bevatten.

## Native functies

De app bevat native schermen voor:

- login en sessieherstel;
- cockpit en dagstatistieken;
- agenda met lessen, proeflessen en overige afspraaktypen;
- leerlingen, contactgegevens en lestegoed;
- volledig taakbeheer inclusief leerlingkoppeling;
- berichten en bericht verzenden;
- voertuigen en beschikbaarheid;
- rijschoolwissel, buildinformatie en sessiebeheer.
- openbare links naar privacybeleid en account-/gegevensverwijdering.

Verified app links voor `https://nxtdrive.io/instructeur/*` openen het passende
native scherm. De webapp levert daarvoor `/.well-known/assetlinks.json`.
Configureer op productie:

```text
ANDROID_INSTRUCTOR_APP_SIGNING_SHA256_FINGERPRINTS
```

Gebruik de SHA-256-fingerprint van de **Play App Signing key**, niet van de
uploadkey.

## Sessie- en beveiligingscontract

De Android-app gebruikt geen webcookies.

1. De native loginroute wisselt e-mail en wachtwoord via TLS in voor een
   Supabase access- en refresh-token.
2. Alleen accounts met `instructor`- of `tenant_admin`-lidmaatschap ontvangen
   een mobiele sessie.
3. Access- en refresh-token worden samen met vervaltijd en actieve tenant
   AES-GCM-versleuteld opgeslagen. De niet-exporteerbare sleutel staat in
   Android Keystore.
4. Bij cold start wordt de sessie hersteld. Een token wordt 90 seconden voor
   verloop vernieuwd.
5. Refreshrotatie is met een coroutine-mutex geserialiseerd. Gelijktijdige
   API-calls kunnen daardoor niet hetzelfde refresh-token parallel gebruiken.
6. Een API-`401` veroorzaakt precies één geforceerde refresh en één retry.
7. Een ongeldig of ingetrokken refresh-token wist de lokale sessie en toont
   opnieuw het loginscherm.
8. Een tijdelijke netwerkfout wist een nog aanwezige sessie niet. De app toont
   een herstelbare offline-status.
9. **Uitloggen op dit apparaat** trekt de huidige refreshsessie in en wist
   altijd de lokale ciphertext.
10. **Alle sessies uitloggen** vraagt een globale Supabase sign-out aan en wist
    daarna de lokale ciphertext.

Elke mobiele data- en mutatieroute valideert het Bearer-token opnieuw en leidt
tenant, gebruiker en rollen server-side af. Een meegestuurde tenant-ID is alleen
een selectie en verleent nooit toegang.

## Mobiele API

Authenticatie:

```text
POST /api/mobile/auth/login
POST /api/mobile/auth/refresh
POST /api/mobile/auth/logout
```

Instructeursdata:

```text
GET    /api/mobile/instructor/bootstrap
POST   /api/mobile/instructor/planning
POST   /api/mobile/instructor/students
POST   /api/mobile/instructor/students/{studentId}/credits
POST   /api/mobile/instructor/tasks
PATCH  /api/mobile/instructor/tasks/{taskId}
DELETE /api/mobile/instructor/tasks/{taskId}
POST   /api/mobile/instructor/conversations/{conversationId}/messages
```

Mutaties gebruiken dezelfde tenantgrenzen, eigendomscontroles en beveiligde
database-RPC's als het webportaal. Login is gekoppeld aan de bestaande
server-side rate limiter.

## Lokaal bouwen

Vereisten: Node 24, pnpm 10.26.1, JDK 21, Android SDK Platform 36 en Build
Tools 36.0.0.

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/nxtdrive run android:assets

cd artifacts/nxtdrive/android
./gradlew --no-daemon \
  testDebugUnitTest testStagingUnitTest testProductionUnitTest \
  lintDebug lintStaging lintProduction assembleDebugAndroidTest
./gradlew --no-daemon assembleDebug bundleStaging
```

Er is bewust geen `cap sync`-stap meer. Zo'n stap zou de full-native broncode
weer in een webcontainer veranderen.

`bundleProduction` faalt zonder alle signingvariabelen:

```text
ANDROID_UPLOAD_KEYSTORE_PATH
ANDROID_UPLOAD_KEYSTORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
```

Voor een lokale production smoke-test mag uitsluitend een tijdelijke testkey
worden gebruikt:

```bash
release_keystore_dir="$(mktemp -d)"
keytool -genkeypair \
  -keystore "$release_keystore_dir/local-release-smoke.jks" \
  -storepass changeit \
  -keypass changeit \
  -alias local-release-smoke \
  -keyalg RSA \
  -keysize 3072 \
  -validity 30 \
  -dname "CN=NXTDRIVE local release smoke"

ANDROID_UPLOAD_KEYSTORE_PATH="$release_keystore_dir/local-release-smoke.jks" \
ANDROID_UPLOAD_KEYSTORE_PASSWORD=changeit \
ANDROID_UPLOAD_KEY_ALIAS=local-release-smoke \
ANDROID_UPLOAD_KEY_PASSWORD=changeit \
ANDROID_VERSION_NAME=1.0.0 \
ANDROID_VERSION_CODE=202607291 \
ANDROID_GIT_SHA="$(git rev-parse HEAD)" \
./gradlew --no-daemon bundleProduction

jarsigner -verify -certs \
  app/build/outputs/bundle/production/app-production.aab
sha256sum app/build/outputs/bundle/production/app-production.aab
```

Verwijder de tijdelijke map direct na de controle.

## Tests

De releasegate controleert alle drie de varianten. Native unit-tests bewijzen
onder andere:

- een geldige sessie wordt zonder onnodige refresh hersteld;
- een bijna verlopen sessie roteert access- én refresh-token;
- gelijktijdige calls veroorzaken maar één refresh;
- gelijktijdige `401`-responses veroorzaken maar één geforceerde refresh;
- een geweigerde refresh wist de lokale sessie;
- `MainActivity` is een echte Android `ComponentActivity`;
- package-ID, versie, kanaal, API-host en commitmetadata zijn aanwezig.
- de juridische links gebruiken de canonieke publieke HTTPS-URL's.

De gecompileerde instrumentatietest controleert op een Android-toestel dat een
sessie na een opslag-roundtrip gelijk blijft, dat access- en refresh-token niet
in de ruwe preferences voorkomen en dat uitloggen de versleutelde payload wist.

Voer voor gesloten distributie daarnaast op een fysieke Play-installatie uit:

- login en foutieve login;
- cold start na process kill;
- achtergrond/voorgrond en offline/online;
- tokenrefresh na langere inactiviteit;
- lokaal en globaal uitloggen;
- app-link vanuit e-mail;
- taak toevoegen/bewerken/verwijderen;
- bericht verzenden;
- telefoon, 7-inch en 10-inch tablet, portrait en landscape.

## GitHub-workflows

`android-internal.yml` voert de volledige repositorygate, assetgeneratie,
native Gradle-tests, lint, signing, AAB-verificatie, checksum en optionele
Play-upload uit.

- `internal`: interne testtrack;
- `closed`: gesloten track met Play-ID `alpha`;
- `internal-and-closed`: exact dezelfde AAB naar beide tracks.

Een handmatige run met `dry_run=false` faalt wanneer signing- of
Play-credentials ontbreken. RC-tags
`instructor-vMAJOR.MINOR.PATCH-rc.N` starten de interne flow.

`android-production.yml` downloadt exact de eerder intern geteste AAB voor
dezelfde commit. Productie bouwt niet opnieuw en vereist goedkeuring via de
beschermde GitHub Environment `google-play-production`.

## Halt en herstel

- Pauzeer de betreffende Play-track wanneer distributie moet stoppen.
- Een `versionCode` mag nooit voor andere bytes worden hergebruikt.
- Trek bij een authenticatie-incident alle sessies in Supabase in en roteer
  betrokken credentials.
- Publiceer een fix met een hoger `versionCode` via dezelfde testgates.
- Een backendrollback moet compatibel blijven met de reeds verspreide mobiele
  API-versie.
