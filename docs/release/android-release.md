# Android release-runbook

## Architectuur en varianten

De app is een Capacitor-container rond dezelfde NXTDRIVE webapp; er bestaat geen
tweede mobiele UI.

| Buildtype  | Application ID                    | Backend               | Signing                          |
| ---------- | --------------------------------- | --------------------- | -------------------------------- |
| debug      | `io.nxtdrive.instructeur.debug`   | staging               | lokale debugkey                  |
| staging    | `io.nxtdrive.instructeur.staging` | staging               | lokale debugkey, alleen dry-run  |
| production | `io.nxtdrive.instructeur`         | `https://nxtdrive.io` | verplichte uploadkey uit secrets |

`minSdk=24` is gekozen omdat Capacitor 8 dit minimum hanteert en Android 7+
moderne TLS/WebView- en Keystore-API's biedt. `compileSdk` en `targetSdk` zijn
beide 36.

Productie:

- blokkeert cleartext en mixed content;
- is niet debuggable;
- gebruikt minification en resource shrinking;
- ondersteunt portrait, landscape, resize en multi-window zonder
  oriëntatielock;
- registreert verified app links voor `/instructeur/*`;
- gebruikt een Android Keystore-backed AES-GCM-plugin voor tijdelijke lokale
  conceptwaarden.

## Lokaal valideren

Vereisten: Node 24, pnpm 10.26.1, JDK 21 en Android SDK Platform 36.

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/nxtdrive run android:assets
pnpm --filter @workspace/nxtdrive run android:sync
cd artifacts/nxtdrive/android
./gradlew testDebugUnitTest testStagingUnitTest lintDebug lintStaging
./gradlew assembleDebug bundleStaging
```

`bundleProduction` faalt bewust zonder alle vier signingvariabelen:

```text
ANDROID_UPLOAD_KEYSTORE_PATH
ANDROID_UPLOAD_KEYSTORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
```

CI ontvangt de keystore als
`ANDROID_UPLOAD_KEYSTORE_BASE64`, decodeert hem alleen naar een tijdelijk
runnerbestand en wist dit bestand altijd.

## Releasepad

1. Tag een kandidaat als `instructor-vMAJOR.MINOR.PATCH-rc.N` of start
   `Android internal release` handmatig.
2. De workflow herhaalt de volledige releasegate, Android tests en lint.
3. Met signingsecrets bouwt zij een production AAB; zonder secrets alleen een
   duidelijk gelabelde staging dry-run AAB.
4. Iedere AAB krijgt `jarsigner`-verificatie, SHA-256-checksum en publieke
   certificaatfingerprint.
5. Alleen met Play-credentials en niet-dry-run wordt naar internal of de
   geconfigureerde closed track geüpload.
6. Productie downloadt exact het production AAB uit de geslaagde interne run
   voor dezelfde commit. Zij bouwt niet opnieuw.
7. De beschermde Environment `google-play-production`, privacycheck, volledige
   store-assets en een staged rollout zijn verplicht.

## Rollback en halt

- Stop een actieve staged rollout in Play Console of zet de release via de
  Publishing API op `halted`.
- Herstel nooit door hetzelfde `versionCode` met andere bytes te uploaden.
- Corrigeer code, verhoog de commit-gebaseerde `versionCode`, doorloop opnieuw
  internal en promoveer daarna het exact geteste artefact.
- Een web-only incident volgt daarnaast `docs/PRODUCTION_RUNBOOK.md`.
