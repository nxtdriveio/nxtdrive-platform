# NXTDRIVE Instructeur — Google Play release

De instructeursapp is een full-native Kotlin/Jetpack Compose-app in
`artifacts/nxtdrive/android`. De eerdere TWA- en Capacitor-instructies zijn
vervallen.

Canonieke identiteit:

| Onderdeel              | Waarde                                    |
| ---------------------- | ----------------------------------------- |
| Appnaam                | NXTDRIVE Instructeur                      |
| Package-ID             | `io.nxtdrive.instructeur`                 |
| Productiedomein        | `https://nxtdrive.io`                     |
| Canonieke app-link     | `https://nxtdrive.io/instructeur/*`       |
| compileSdk / targetSdk | 36 / 36                                   |
| minSdk                 | 24                                        |
| Eerste versie          | `1.0.0` (`202607291`)                     |
| Privacybeleid          | `https://nxtdrive.io/privacy`             |
| Accountverwijdering    | `https://nxtdrive.io/account-verwijderen` |

Gebruik voor de volledige technische runbook:

- `docs/release/android-release.md`;
- `docs/release/google-play-external-actions.md`;
- `artifacts/nxtdrive/android/play-store/`.

De workflows bouwen en verifiëren App Bundles, maar uploaden alleen wanneer alle
signing- en Play-secrets bestaan. Productie promoveert exact het eerder
opgeslagen interne AAB en vereist approval van de beschermde GitHub Environment
`google-play-production`.

Play-screenshots moeten via de native `adb`-captureflow uit een geïnstalleerde
build komen. De assetvalidator eist per apparaatklasse een
`provenance.json` met overeenkomende checksums; browserfixtures worden bewust
afgekeurd.

Een echte Play-upload is vanuit repositorycode niet aantoonbaar en mag alleen
uit de workflowrun en Play Console-status worden gerapporteerd.
