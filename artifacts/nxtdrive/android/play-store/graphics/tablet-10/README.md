# Native 10-inch-tabletscreenshots

Installeer exact de intern geteste `io.nxtdrive.instructeur`-build op een
10-inch-profiel en gebruik uitsluitend synthetische reviewdata:

```bash
ANDROID_SCREENSHOT_CLASS=tablet-10 \
ANDROID_SCREENSHOT_SYNTHETIC_DATA_CONFIRMED=true \
pnpm --filter @workspace/scripts run capture:android-store
```

De capture schrijft package-, versie-, toestel- en SHA-256-bewijs naar
`provenance.json`. Maak zowel portrait- als landscape-assets wanneer Play
Console die presentatie gebruikt. Browsercaptures en webfixtures zijn niet
toegestaan.
