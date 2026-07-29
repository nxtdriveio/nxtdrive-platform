# Google Play — resterende externe acties

Deze acties vereisen eigenaar-, juridisch of extern accountrecht. Alle
repositoryvoorbereiding kan zonder deze rechten worden gevalideerd.

1. **Package-identiteit bevestigen**
   Controleer in Play Console of al een instructeursapp gepubliceerd is. Als
   een bestaand package-ID bestaat, mag `io.nxtdrive.instructeur` niet zonder
   migratiebesluit worden aangemaakt.

2. **Play-app en App Signing activeren**
   Maak de app aan, activeer Play App Signing en bewaar de uploadkey in een
   beveiligde offline back-up. Commit nooit een `.jks`/`.keystore`.

3. **GitHub secrets instellen**

   ```text
   ANDROID_UPLOAD_KEYSTORE_BASE64
   ANDROID_UPLOAD_KEYSTORE_PASSWORD
   ANDROID_UPLOAD_KEY_ALIAS
   ANDROID_UPLOAD_KEY_PASSWORD
   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
   ```

4. **Service account autoriseren**
   Geef uitsluitend noodzakelijke rechten voor de app en internal/closed/
   production-tracks. Gebruik geen organisatiebrede beheerrechten.

5. **GitHub Environments beschermen**
   Configureer `google-play-internal` en `google-play-production`; productie
   vereist minimaal één bevoegde reviewer en mag geen self-approval toestaan.

6. **App-signingfingerprint publiceren**
   Zet de Play App Signing SHA-256-fingerprint als
   `ANDROID_INSTRUCTOR_APP_SIGNING_SHA256_FINGERPRINTS` in de productieomgeving
   van de webapp. Verifieer daarna:

   ```bash
   curl --fail https://nxtdrive.io/.well-known/assetlinks.json
   ```

7. **Echte screenshots vastleggen**
   Maak captures van de exact geteste AAB met synthetische pilotdata voor
   telefoon, 7-inch en 10-inch tablet. De productionworkflow weigert ontbrekende
   of effen placeholders.

8. **Privacy en Data Safety goedkeuren**
   Laat eigenaar/legal de voorbereidende inventaris, privacy policy,
   accountverwijdering en alle actieve third-party SDK's controleren.

9. **Reviewaccount veilig aanleveren**
   Maak een least-privilege account met synthetische data en vul credentials
   uitsluitend in Play Console in.

10. **Internal upload en productieapproval**
    Voer eerst de interne workflow uit en verifieer de Play Console-status.
    Productie start standaard als gefaseerde rollout en wordt niet automatisch
    naar 100% gezet.

Geen van deze externe stappen is in de repositoryrun uitgevoerd of gefingeerd.
