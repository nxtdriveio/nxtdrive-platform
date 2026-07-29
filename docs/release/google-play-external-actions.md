# Google Play: resterende externe acties

Deze acties vereisen eigenaar-, juridisch of extern accountrecht. De technische
repositoryvoorbereiding kan zonder deze rechten als dry-run worden gevalideerd.

1. **Package-identiteit bevestigen**
   Controleer of al een instructeursapp bestaat. Een bestaand package-ID en
   signingidentiteit moeten behouden blijven.

2. **Play-app en App Signing activeren**
   Maak zo nodig `io.nxtdrive.instructeur` aan, activeer Play App Signing en
   upload de eerste production-AAB handmatig.

3. **Uploadkey en GitHub-secrets instellen**

   ```text
   ANDROID_UPLOAD_KEYSTORE_BASE64
   ANDROID_UPLOAD_KEYSTORE_PASSWORD
   ANDROID_UPLOAD_KEY_ALIAS
   ANDROID_UPLOAD_KEY_PASSWORD
   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
   ```

4. **Serviceaccount autoriseren**
   Geef alleen releaserechten voor deze app en de gebruikte test- en
   productietracks.

5. **GitHub Environments beschermen**
   Configureer `google-play-internal` en `google-play-production`. Productie
   vereist minimaal één bevoegde reviewer zonder self-approval.

6. **Verified app links activeren**
   Zet de SHA-256-fingerprint van de Play App Signing key in:

   ```text
   ANDROID_INSTRUCTOR_APP_SIGNING_SHA256_FINGERPRINTS
   ```

7. **Privacy en Data Safety goedkeuren**
   Laat eigenaar/legal de inventaris, privacy policy, accountverwijdering en
   actieve third-party SDK's controleren. De native app gebruikt netwerk-,
   Compose- en authenticatiecode maar bevat geen WebView of advertentie-SDK.
   Vul vóór publicatie de volledige statutaire naam, vestigingsadres, KvK- en
   btw-gegevens van de NXTDRIVE-aanbieder in de juridische documentatie en Play
   Console in; deze gegevens zijn niet veilig uit broncode af te leiden.

8. **Testers en reviewaccount inrichten**
   Gebruik synthetische data en lever credentials alleen via Play Console aan.

9. **Native screenshots maken**
   Installeer exact de ondertekende AAB via Play Internal App Sharing of de
   interne track op echte telefoon- en tabletprofielen. Leg cockpit, agenda,
   leerlingen, taken en instellingen vast. Gebruik geen webfixturecaptures als
   Play-appscreenshots.

10. **Versiecode verifiëren**
    De eerste kandidaat reserveert `versionName=1.0.0` en
    `versionCode=202607291`. Controleer de hoogste bestaande Play-code; kies bij
    twijfel een hogere en leg die vast bij checksum en commit. Hergebruik is
    verboden.

11. **Interne en gesloten release uitvoeren**
    Volg [google-play-testing.md](./google-play-testing.md).

Geen externe upload of Play Console-handeling wordt als uitgevoerd beschouwd
tot de betreffende workflow en Play Console-status dit aantoonbaar bevestigen.
