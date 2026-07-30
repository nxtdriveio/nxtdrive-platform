# Maps & Routing visual baselines

Captured from the production build with a fixed Amsterdam clock, synthetic data and `VISUAL_FIXTURES_ENABLED=true`. The regression command passed all 29 repository baselines; 20 are Maps-specific.

| Baseline                        | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| maps-address-autocomplete.png   | `7d2f5feac1b7a3d44832f071134d5a9ac13286a2d16ab0aaa5fe6fb1ce457ff9` |
| maps-cancellation-recovery.png  | `6f63170f0bd67e7bb7fcfc761f8201d931043bc16d6f8cedc193820be33e361f` |
| maps-cbr-catalog.png            | `9b37a26d32a0181b3bca1db8ca227f03ca1964cf230e4801749f6e7dabafb932` |
| maps-control-center.png         | `f747c1ca73d1e5c1feb1cfe874d6dcc06011dbaf4cb003fcf82e6711219d12c9` |
| maps-degraded-state.png         | `8f5aaf62fb2bcdff0756343766f319c9c7a9ff43407e46c80a075f63aa659520` |
| maps-empty-miles.png            | `a6285431afc5d0b3107bffe6193dfc3d6580089d59506e12d7f566dae8dc7f91` |
| maps-instructor-day-mobile.png  | `c114fd12c975748fd77304398d6dc61dbc08a46e244eb4d816afb90c68f3eaa2` |
| maps-instructor-day-tablet.png  | `644f2bd048056ab6131066775179b2f7419bebb8527c76ca57e8520f74806b85` |
| maps-instructor-next.png        | `0e9a1625c2c17578edfa8f26f5a0d9a31dfa216742b4363e446abe874889c0b4` |
| maps-lesson-location-picker.png | `47120e559c74bccf373b178fa895825840328f07bad8718bb668203c3f3e93bf` |
| maps-manual-correction.png      | `a3b8df0b534542ae8d1dd46188d79818a1e2e11e6deddc08d2747409deb399f5` |
| maps-planboard-desktop.png      | `c357d2cb3b0169f0977e7c7299950da2290b2753b3fd0c1a8c42405c0784655a` |
| maps-planboard-tablet.png       | `c44bd8ab473450f4a6f22318beb09257d529ef2dfb4ac285ab360139e5125922` |
| maps-postcode-analysis.png      | `5a9dde85ddc2eb529574c6776df05a016467726f13b22f3deb91ab80d92b521d` |
| maps-route-conflict.png         | `65440f229d8172b7f72a159bb9c17e75ac540465972f16f41d184fa9584542ed` |
| maps-route-optimization.png     | `66bdd1f97cf19098a3399afe5319739ef5e9e31300b58f1ef60221f09d258a7a` |
| maps-student-confirmation.png   | `f40ce6dc387f69e2c614851bf7b515aacbb7d7935efda34c308c78ee4a2daf3d` |
| maps-student-locations.png      | `1b9421a8fadd53d125b450440e87a74736ddfc04760a9143d376b25213858d37` |
| maps-tenant-limits.png          | `6a01cba57af15d6cf89dbbfbc543f8467d91a386b3c811acf1d49c3b9df014d0` |
| maps-work-areas.png             | `676ae561971657f754c8e9cba59689d2ec05e75d388ca48e7be51da3a5405e5c` |

Canonical files: `scripts/visual-baselines/`. These are fixtures, not evidence of a live Google production activation.
