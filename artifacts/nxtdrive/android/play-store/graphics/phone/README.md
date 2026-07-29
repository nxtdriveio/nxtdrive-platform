# Native telefoonscreenshots

Alle Play-PNG's in deze map moeten met `adb screencap` afkomstig zijn van een
daadwerkelijk geïnstalleerde `io.nxtdrive.instructeur`-build. De
`provenance.json` legt package, versie, toestel en SHA-256 per bestand vast.
Browsercaptures en webfixtures worden door de Play-validator geweigerd.

Gebruik uitsluitend een reviewaccount met synthetische data:

```bash
ANDROID_SCREENSHOT_CLASS=phone \
ANDROID_SCREENSHOT_SYNTHETIC_DATA_CONFIRMED=true \
pnpm --filter @workspace/scripts run capture:android-store
```

Installeer voor definitieve Play-assets exact de ondertekende intern geteste
build op een representatieve telefoon.
