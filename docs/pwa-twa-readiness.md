# NXTDRIVE — PWA / TWA readiness report

> **Historisch document.** De TWA-publicatiestrategie voor de instructeursapp
> is vervangen door de full-native Kotlin/Jetpack Compose-app met package-ID
> `io.nxtdrive.instructeur`. Zie `docs/GOOGLE_PLAY_PUBLISHING.md`. Claims over
> effen screenshots en Play-gereedheid hieronder zijn geen actueel
> releasebewijs.

Audit and hardening of the **Leerling** and **Instructeur** PWAs so both pass
Lighthouse PWA checks, install correctly on iOS **and** Android, work offline
without leaking private learner data, and are ready for Trusted Web Activity
(TWA) publication in the Play Store.

The backoffice is intentionally **not** a PWA (desktop-only — no manifest, no
service worker). Only `/leerling` and `/instructeur` are installable surfaces.

---

## 1. Audit summary — issues found

The manifests, icons, offline pages, `assetlinks.json` and the SW push handlers
were already correct. The audit surfaced seven concrete gaps:

| #   | Severity                | Issue                                                                                                                                    |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1 — installability     | Viewport metadata missing `width=device-width` / `initial-scale=1` / `viewport-fit=cover` on all three layouts.                          |
| 2   | P1 — installability     | SW registered without `{ updateViaCache: 'none' }`, so SW updates lag behind a deploy.                                                   |
| 3   | P2 — iOS UX             | No `env(safe-area-inset-*)` handling: bottom nav overlapped the iOS home indicator, top bars could clip under the status bar.            |
| 4   | P2 — iOS UX             | No `apple-touch-startup-image` tags → blank white screen while an iOS standalone install boots.                                          |
| 5   | P3 — Android conversion | No `beforeinstallprompt` banner → users only see Chrome's easily-missed mini-infobar.                                                    |
| 6   | P3 — Android conversion | No `screenshots` in the manifests → poorer Chrome install dialog and Play listing.                                                       |
| 7   | P4 — privacy            | SW cached every authenticated navigation in the Cache API → on a shared device a later user could read the previous user's page offline. |

---

## 2. Fixes applied

### Issue 1 — Viewport metadata (all three layouts)

`app/layout.tsx`, `app/student/layout.tsx`, `app/instructor/layout.tsx` now
export `width: "device-width"`, `initialScale: 1` and `viewportFit: "cover"` in
their `viewport` export. Next.js renders
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
`viewport-fit=cover` is what makes the `safe-area-inset` env vars resolve to real
values on notched iPhones.

### Issue 2 — SW update freshness

`components/pwa/service-worker-register.tsx` now calls
`navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })`, so the
browser bypasses its HTTP cache when checking `/sw.js` for updates.

### Issue 3 — Safe-area insets

- `StudentBottomNav` already had `padding-bottom: env(safe-area-inset-bottom)`.
- Added `padding-top: env(safe-area-inset-top)` to the student `TopBar` and the
  instructor mobile top bar (in `instructor/Sidebar.tsx`).
- `env()` resolves to `0` outside standalone mode, so normal browser tabs are
  unaffected.

### Issue 4 — iOS splash screens

Added `appleWebApp.startupImage` entries (rendered as
`apple-touch-startup-image` link tags) to the student and instructor layouts.
The source images are solid navy (`#0F172A`) SVGs in
`public/splash/` sized for the highest-traffic modern iPhones:

- `ios-splash-1170x2532.svg` — iPhone 12–15 (390×844 @3×)
- `ios-splash-828x1792.svg` — iPhone XR/11 (414×896 @2×)

Other devices fall back to the manifest `background_color` (also `#0F172A`), so
there is no white flash anywhere.

### Issue 5 — Install banner

New `components/pwa/InstallPromptBanner.tsx` (`"use client"`) intercepts
`beforeinstallprompt`, suppresses Chrome's mini-infobar and shows a small,
dismissable branded CTA ("Voeg NXTDRIVE toe aan je beginscherm"). The dismissal
is remembered in `localStorage` per app
(`nxtdrive-install-dismissed-student` / `-instructor`). It is mounted in both
layouts, under the top bar and above the main content. iOS never fires
`beforeinstallprompt`, so the banner simply never appears there.

### Issue 6 — Manifest screenshots

Both manifest route handlers now include a `screenshots` array:

- student → `form_factor: "narrow"` (phone/portrait), `1080×1920`
- instructor → `form_factor: "wide"` (tablet/landscape), `1920×1080`

The referenced files in `public/screenshots/` are **solid-navy placeholders** —
404-safe and correctly sized. Replace them with real captures before the Play
Store upload (see §4).

### Issue 7 — Navigation cache privacy

The SW `fetch` navigate handler no longer writes authenticated navigation
responses to the Cache API. Offline navigations now resolve **only** to the
static, data-free offline page (`/leerling/offline`, `/instructeur/offline`),
never a previously-rendered authenticated page. `CACHE_VERSION` bumped to `v3`
to evict the old `v2` shell cache (which still held authenticated pages) on the
next activate.

**Trade-off (documented in `sw.js`):** this is a deliberate downgrade of the
offline UX — there is no "last seen page" offline anymore — accepted in exchange
for correct privacy on an app holding private learner data (names, lesson
overviews, credit balances). On shared devices (parent + child on one phone)
this prevents one user from reading another's cached page.

---

## 3. Test results checklist

Run on production (or staging) `https://nxtdrive.io`.

### Lighthouse (Chrome DevTools → Lighthouse → PWA), per app

- [ ] `/leerling` — Installable
- [ ] `/leerling` — PWA Optimized
- [ ] `/instructeur` — Installable
- [ ] `/instructeur` — PWA Optimized
- [ ] Has a `<meta name="viewport">` tag with `width`/`initial-scale` ✅
- [ ] Manifest with valid icons (192 + 512 + maskable) ✅
- [ ] Service worker registered, responds 200 when offline ✅

### iOS (Safari → Deel → Zet op beginscherm → open standalone)

- [ ] No white flash on launch (navy splash shows).
- [ ] Bottom nav does not overlap the home indicator.
- [ ] Top bar does not clip under the status bar / notch.
- [ ] `theme-color` navy applied.

### Android (Chrome)

- [ ] Branded install banner appears and is dismissable; dismissal persists.
- [ ] After install, no browser URL bar in standalone.
- [ ] Chrome install dialog shows the screenshots.

### Privacy / shared device

- [ ] Log in as user A, load `/leerling`, go offline → still works.
- [ ] Log out, log in as user B (or stay logged out), go offline, open `/leerling`
      → see the generic offline page, **not** user A's cached content.

---

## 4. Remaining attention points (not done here — by design)

- **Real screenshots** — replace the placeholders in `public/screenshots/` with
  actual captures (student: phone portrait; instructor: 7"/10" tablet
  landscape) before the Play listing.
- **SHA-256 fingerprints** — `app/.well-known/assetlinks.json/route.ts` still
  has placeholder fingerprints. They can only be filled after the first Play
  upload generates the signing key (see §5).
- **Play Store upload / TWA build** — Bubblewrap build and the actual upload are
  out of scope here; the full runbook is `docs/GOOGLE_PLAY_PUBLISHING.md`.

---

## 5. TWA preparation summary

Two apps ship from the one Next.js codebase, one per PWA surface:

| App                  | Package id                | Wraps                             | Manifest                            | Orientation |
| -------------------- | ------------------------- | --------------------------------- | ----------------------------------- | ----------- |
| NXTDRIVE Leerling    | nog niet vastgesteld      | `https://nxtdrive.io/leerling`    | `/leerling/manifest.webmanifest`    | responsive  |
| NXTDRIVE Instructeur | `io.nxtdrive.instructeur` | `https://nxtdrive.io/instructeur` | `/instructeur/manifest.webmanifest` | responsive  |

Already in the repo: per-app manifests, maskable + apple icons, the service
worker, `/.well-known/assetlinks.json` (placeholder fingerprints), and the
`/privacy` policy page.

Bubblewrap steps (detail in `docs/GOOGLE_PLAY_PUBLISHING.md`):

1. `npm i -g @bubblewrap/cli && bubblewrap doctor`
2. `bubblewrap init --manifest <manifest-url>` once per app (separate folders).
3. `bubblewrap build` → generates the signing keystore (**back it up**) and the
   `.aab`.
4. Copy the **Play App Signing** SHA-256 into the two
   `sha256_cert_fingerprints` arrays in `assetlinks.json/route.ts`, redeploy,
   re-verify with Google's Statement List tester.
5. Create two Play listings, upload each `.aab`, fill store listing + Data
   safety, set Privacy policy URL `https://nxtdrive.io/privacy`, roll out
   internal → closed → production.

The web content updates live on every production deploy; only native shell
changes (icons, orientation, package metadata, splash) need a new Play release.
