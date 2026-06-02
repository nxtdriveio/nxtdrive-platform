---
name: Google Maps JS loader (loading=async)
description: Why the shared Maps loader must use Google's bootstrap + importLibrary, not a plain script onload.
---

# Google Maps JS loader

A plain `<script src=".../maps/api/js?...&loading=async">` fires its `onload`
**before** `google.maps` is usable: `importLibrary`, `Map`, `Marker`, and even an
eagerly-requested `places` are all `undefined` right after onload. Constructing
`new google.maps.Map(...)` then throws `google.maps.Map is not a constructor`.

**Rule:** use Google's official inline bootstrap loader (defines
`google.maps.importLibrary` synchronously), then `await importLibrary(...)` for
every library you touch (`maps`, `marker`, `core`, `places`) before using its
constructors. Load them once in the shared loader so the returned namespace has
everything populated for all callers.

**Why:** with `loading=async` nothing except the bootstrap stub is guaranteed at
onload; libraries are pulled on demand.

**Graceful degradation:** set `window.gm_authFailure` to capture auth/activation
failures (invalid key, billing off, **Maps JavaScript API not enabled** →
`ApiNotActivatedMapError`, referrer blocked). Google otherwise paints an "Oops!"
overlay inside the map div; the hook lets callers hide the map and show their
non-map fallback. Note `ApiNotActivatedMapError` is a Google Cloud project
config issue (enable "Maps JavaScript API" on the key), not a code bug — the
console error still logs even when the overlay is suppressed.
