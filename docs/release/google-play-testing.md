# Google Play: interne en gesloten tests

Deze handleiding is bijgewerkt voor 29 juli 2026. Google Play accepteert vanaf
31 augustus 2026 nieuwe mobiele apps en updates alleen wanneer zij Android 16
(API 36) of hoger targeten. Deze app target API 36.

Officiële referenties:

- [interne en gesloten tests instellen](https://support.google.com/googleplay/android-developer/answer/9845334);
- [testvereisten voor nieuwe persoonlijke accounts](https://support.google.com/googleplay/android-developer/answer/14151465);
- [target-API-eisen](https://developer.android.com/google/play/requirements/target-sdk);
- [Play App Signing en uploadkeys](https://developer.android.com/studio/publish/app-signing).

## 1. Eenmalige Play Console-inrichting

1. Controleer of er al een NXTDRIVE-instructeursapp bestaat. Een bestaand
   package-ID en de bijbehorende signingidentiteit moeten behouden blijven.
2. Maak anders de app aan met package-ID `io.nxtdrive.instructeur`.
3. Activeer Play App Signing.
4. Genereer een afzonderlijke uploadkey en bewaar een versleutelde offline
   back-up. Commit de key nooit.
5. Upload de eerste production-AAB één keer handmatig in Play Console. De
   gebruikte GitHub upload-action vereist dat het package al in Play Console
   bestaat.
6. Koppel een Google Cloud-serviceaccount aan Play Console en geef alleen
   releaserechten voor deze app en de benodigde tracks.
7. Kopieer bij **App integrity → App signing** de SHA-256-fingerprint van de
   Play App Signing key naar de productieomgeving van de webapp:

   ```text
   ANDROID_INSTRUCTOR_APP_SIGNING_SHA256_FINGERPRINTS
   ```

8. Controleer daarna:

   ```bash
   curl --fail https://nxtdrive.io/.well-known/assetlinks.json
   ```

De response moet `io.nxtdrive.instructeur` en de Play App Signing-fingerprint
bevatten.

## 2. GitHub instellen

Maak de GitHub Environment `google-play-internal` aan en voeg deze secrets toe:

```text
ANDROID_UPLOAD_KEYSTORE_BASE64
ANDROID_UPLOAD_KEYSTORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
```

Linux-opdracht om de keystore zonder regeleinden te encoderen:

```bash
base64 -w 0 nxtdrive-upload.jks
```

Gebruik op macOS:

```bash
base64 < nxtdrive-upload.jks | tr -d '\n'
```

Plak uitsluitend de uitvoer in het GitHub-secret. De workflow decodeert de
keystore naar een tijdelijk runnerbestand, zet permissie `0600` en verwijdert
het bestand altijd.

## 3. Interne testers configureren

1. Ga in Play Console naar **Testing → Internal testing → Testers**.
2. Maak een e-maillijst met Google- of Google Workspace-accounts.
3. Selecteer de lijst, stel een feedbackadres in en sla op.
4. Bewaar de opt-inlink voor de testers.

Google ondersteunt maximaal 100 interne testers. Een interne build is doorgaans
binnen enkele minuten beschikbaar.

## 4. Eerste dry-run

Start in GitHub Actions **Android internal and closed testing** handmatig:

```text
dry_run: true
channel: internal
version_name: 1.0.0
version_code: 202607291
```

Controleer het artifact:

- alle repository- en Gradle-tests groen;
- Android lint groen;
- artifact heet `staging-dry-run`;
- `jarsigner`-verificatie geslaagd;
- SHA-256 en fingerprint aanwezig;
- geen uploadmelding.

Een dry-run bewijst de techniek, maar is geen Play-release.

## 5. Upload naar interne test

Start dezelfde workflow opnieuw:

```text
dry_run: false
channel: internal
version_name: 1.0.0
version_code: 202607291
```

`202607291` is de gereserveerde code voor de eerste 1.0.0-kandidaat. Bevestig
vóór upload dat Play Console voor `io.nxtdrive.instructeur` nog geen gelijke of
hogere code bevat. Een leeg veld gebruikt daarna de stijgende
GitHub-Actions-counter boven deze gereserveerde code. Vul handmatig een nog
hogere code in wanneer het Play-package al hogere codes bevat.

Na een groene run:

1. controleer in Play Console dat de release op **Internal testing** staat;
2. controleer dat versie, checksum en GitHub commit bij het bewijs horen;
3. open de opt-inlink met een intern testeraccount;
4. installeer via Google Play, niet via een los APK-bestand;
5. test login, sessieherstel na process kill, automatische tokenrefresh,
   lokaal/globaal uitloggen, app-link, cockpit, agenda, leerlingen, taakbeheer,
   berichten, privacy- en verwijderlinks, achtergrond/voorgrond,
   offline/online, rotatie en tabletweergave.

## 6. Gesloten test voorbereiden

1. Rond de app-inhoud, privacy policy en vereiste Play-formulieren af.
2. Leg echte Play-screenshots vast vanaf de geïnstalleerde, exact geteste build;
   webfixtures gelden niet als native releasebewijs.
3. Ga naar **Testing → Closed testing** en open de eerste gesloten track.
4. De Developer API-ID van deze eerste track is `alpha`; de workflow gebruikt
   daarom `alpha`.
5. Voeg e-maillijsten of Google Groups toe en configureer het feedbackkanaal.
6. Deel de gesloten opt-inlink.

Een tester die voor de interne track is aangemeld, ontvangt niet tegelijk de
open of gesloten track. Laat zo'n tester eerst uit de interne test stappen en
daarna via de gesloten opt-inlink deelnemen.

Voor persoonlijke developeraccounts die na 13 november 2023 zijn aangemaakt,
kan vóór productietoegang een gesloten test met minimaal 12 continu aangemelde
testers gedurende 14 dagen verplicht zijn. Controleer de eis die Play Console
voor het concrete account toont.

## 7. Upload naar gesloten test

Voor een nieuwe release die direct door beide groepen moet worden getest:

```text
dry_run: false
channel: internal-and-closed
version_name: 1.0.0
version_code: leeg
```

De workflow publiceert exact dezelfde ondertekende AAB in één Play-edit naar
`internal` en `alpha`.

Voor alleen een nieuwe gesloten release:

```text
dry_run: false
channel: closed
version_name: 1.0.1
version_code: leeg
```

Gesloten uploads krijgen een extra gate: alle Nederlandse metadata en echte
telefoon-, 7-inch- en 10-inch-appscreenshots moeten aanwezig en valide zijn.

Een reeds intern gepubliceerde versionCode mag niet met andere bytes opnieuw
worden gebruikt. Promoveer die bestaande release in Play Console naar de
gesloten track of maak een nieuwe workflowrelease met een hogere versionCode.

## 8. RC-tags

Een tag start automatisch een interne release:

```bash
git tag instructor-v1.0.0-rc.1
git push origin instructor-v1.0.0-rc.1
```

De semantische versie komt uit de tag; de versionCode komt uit de stijgende
workflowcounter. Zonder complete credentials blijft een automatische tagrun
een aantoonbare dry-run en claimt de workflow geen upload.

## 9. Stoppen of vervangen

- Pauzeer een test via **Testing → Internal/Closed testing → Manage track →
  Pause track**.
- Testers houden de geïnstalleerde app, maar ontvangen geen nieuwe releases
  vanuit de gepauzeerde track.
- Hergebruik nooit een versionCode.
- Draai bij een fout een nieuwe build met hogere versionCode door dezelfde
  gates.
- Bewaar bij iedere beslissing de AAB-checksum, commit-SHA, testresultaten en
  Play-releasestatus.
