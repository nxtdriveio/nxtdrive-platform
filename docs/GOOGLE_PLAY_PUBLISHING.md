# NXTDRIVE Instructeur — Google Play release

De instructeursapp gebruikt de Capacitor-shell in
`artifacts/nxtdrive/android`. De eerdere TWA-instructies en package-ID's in dit
document zijn vervallen.

Canonieke identiteit:

| Onderdeel              | Waarde                              |
| ---------------------- | ----------------------------------- |
| Appnaam                | NXTDRIVE Instructeur                |
| Package-ID             | `io.nxtdrive.instructeur`           |
| Productiedomein        | `https://nxtdrive.io`               |
| Canonieke app-link     | `https://nxtdrive.io/instructeur/*` |
| compileSdk / targetSdk | 36 / 36                             |
| minSdk                 | 24                                  |

Gebruik voor de volledige technische runbook:

- `docs/release/android-release.md`;
- `docs/release/google-play-external-actions.md`;
- `artifacts/nxtdrive/android/play-store/`.

De workflows bouwen en verifiëren App Bundles, maar uploaden alleen wanneer alle
signing- en Play-secrets bestaan. Productie promoveert exact het eerder
opgeslagen interne AAB en vereist approval van de beschermde GitHub Environment
`google-play-production`.

Een echte Play-upload is vanuit repositorycode niet aantoonbaar en mag alleen
uit de workflowrun en Play Console-status worden gerapporteerd.
