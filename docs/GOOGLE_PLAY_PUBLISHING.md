# NXTDRIVE — Google Play publishing (TWA)

How to ship the **Leerling** and **Instructeur** PWAs to the Google Play Store
as Trusted Web Activities (TWA). A TWA is a thin Android wrapper that renders
the live PWA full-screen (no browser chrome) using Chrome under the hood. We
publish **two** apps from the one Next.js codebase — one per PWA surface.

| App | Package id | URL it wraps | Manifest | Orientation |
|---|---|---|---|---|
| NXTDRIVE Leerling | `com.nxtdrive.student` | `https://app.nxtdrive.io/student` | `/student/manifest.webmanifest` | portrait |
| NXTDRIVE Instructeur | `com.nxtdrive.instructor` | `https://app.nxtdrive.io/instructor` | `/instructor/manifest.webmanifest` | landscape |

> The package ids above must stay in sync with
> `app/.well-known/assetlinks.json/route.ts`. Changing a package id means
> updating Digital Asset Links (see step 4) or installs break.

## Prerequisites

- A **Google Play Developer account** (one-time USD 25 registration).
- The PWAs reachable over HTTPS at `https://app.nxtdrive.io` (production).
- Node.js installed locally (for `@bubblewrap/cli`).
- Each PWA must pass a PWA/installability check (valid manifest, service
  worker, icons, HTTPS). Verify with Chrome DevTools → Application → Manifest,
  or Lighthouse → PWA.

## What already ships from this repo

- **Per-app web manifests** — `/student/manifest.webmanifest` and
  `/instructor/manifest.webmanifest` (route handlers under
  `app/student|instructor/manifest.webmanifest/route.ts`). Each declares
  `display: standalone`, `theme_color`/`background_color` `#0F172A`, the correct
  `orientation`, a unique `id`/`start_url`/`scope`, and the maskable icon set.
- **Maskable + standard icons** — `public/icons/{student,instructor}-*.png`
  at 192, 512 and maskable 192/512, plus `*-apple-180.png`.
- **Service worker** — `public/sw.js` (network-first navigations with an
  offline fallback per app, cache-first own static assets, push handlers).
- **Digital Asset Links** — `app/.well-known/assetlinks.json/route.ts` serves
  `/.well-known/assetlinks.json` with `Content-Type: application/json` and
  `X-Content-Type-Options: nosniff`. The `sha256_cert_fingerprints` value is a
  **placeholder** until you generate the signing key (step 3).
- **Privacy policy** — `/privacy` (required by the Play Console listing).

## Step 1 — Install Bubblewrap

[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) generates and
builds the TWA Android project from a web manifest.

```bash
npm i -g @bubblewrap/cli
bubblewrap doctor   # installs/locates JDK + Android SDK on first run
```

## Step 2 — Initialise each app

Run once per app, in a **separate directory** each (two distinct Android
projects, two package ids).

```bash
# Leerling
bubblewrap init --manifest https://app.nxtdrive.io/student/manifest.webmanifest
# when prompted:
#   Application id : com.nxtdrive.student
#   Host           : app.nxtdrive.io
#   Start URL      : /student
#   Display        : standalone (fullscreen optional)
#   Orientation    : portrait

# Instructeur (in a different folder)
bubblewrap init --manifest https://app.nxtdrive.io/instructor/manifest.webmanifest
#   Application id : com.nxtdrive.instructor
#   Start URL      : /instructor
#   Orientation    : landscape
```

## Step 3 — Generate the signing key and build

```bash
bubblewrap build
```

On first build Bubblewrap creates an Android signing keystore (`android.keystore`).
**Back this up securely** — losing it means you can never update the app on Play.

Get the SHA-256 fingerprint of the signing key:

```bash
keytool -list -v -keystore android.keystore -alias <alias> | grep SHA256
```

> **Recommended:** use **Play App Signing**. Then the fingerprint that matters
> for Digital Asset Links is the one Google shows under
> *Play Console → Release → Setup → App signing → App signing key certificate*,
> **not** your local upload key. Use that SHA-256 in step 4.

## Step 4 — Update Digital Asset Links

Digital Asset Links prove that `app.nxtdrive.io` authorises these Android
packages — this is what removes the browser address bar in the TWA.

Edit `app/.well-known/assetlinks.json/route.ts` and replace the placeholder
`sha256_cert_fingerprints` for **each** package with the real fingerprint(s)
from step 3 (you can list multiple — e.g. both the Play app-signing key and a
local upload key). Deploy to production, then verify:

```bash
curl -s https://app.nxtdrive.io/.well-known/assetlinks.json | jq .
```

Both `com.nxtdrive.student` and `com.nxtdrive.instructor` must be present with a
valid `sha256_cert_fingerprints` array. Google also offers the
[Statement List Generator & Tester](https://developers.google.com/digital-asset-links/tools/generator)
to validate.

## Step 5 — Create the Play listings and upload

In the [Play Console](https://play.google.com/console), create **two** apps
(one per package id). For each:

1. Upload the `.aab` (App Bundle) produced by `bubblewrap build`.
2. Complete the store listing: app name, short/full description, screenshots
   (phone for Leerling, 7"/10" tablet for Instructeur), feature graphic, icon.
3. Set the **Privacy policy URL** to `https://app.nxtdrive.io/privacy`.
4. Fill in Data safety, content rating and target audience.
5. Roll out to internal testing first, then closed/open testing, then
   production.

## Step 6 — Verify the installed app

Install from the internal-testing track and confirm:

- No browser address bar (Digital Asset Links validated).
- Correct splash screen + theme colour (navy `#0F172A`).
- Correct orientation (Leerling portrait, Instructeur landscape).
- Offline fallback works (enable airplane mode → see the offline page).
- Login flow works inside the TWA.

## Updating an app

1. Bump `appVersionCode`/`appVersionName` in the Bubblewrap project
   (`twa-manifest.json`).
2. `bubblewrap update` (pulls manifest changes) then `bubblewrap build`.
3. Upload the new `.aab` to a Play track.

The web content itself updates live on every production deploy — only native
shell changes (icons, orientation, package metadata, splash) require a new
Play release.

## Troubleshooting

- **Address bar still visible** → Digital Asset Links failed. Re-check the
  SHA-256 matches the *signing* key Play actually uses (Play App Signing key,
  not the upload key), and that `/.well-known/assetlinks.json` is served as
  `application/json` over HTTPS without a redirect.
- **Blank screen / wrong app** → `start_url`/`scope` in the manifest doesn't
  match what Bubblewrap was initialised with. The two manifests scope to
  `/student` and `/instructor` respectively.
- **Install banner missing in browser** → run Lighthouse PWA audit; usually a
  manifest field or the service worker isn't being served on production.
