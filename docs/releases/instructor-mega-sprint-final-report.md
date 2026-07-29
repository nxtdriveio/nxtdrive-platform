# NXTDRIVE Instructor Test Readiness Mega-Sprint — eindrapport

Datum: 2026-07-29
Branch: `main`
Bron-SHA: `5f4c94d63d1dc0b1bd4656a44b19cf6a6abdccf4`
Werkstatus: wijzigingen staan bewust ongecommit in de gedeelde worktree.

## 1. Executive summary

De technische testbasis is substantieel versterkt en de lokale releasepoorten
zijn groen: frozen install, format, repositorylint, roottypecheck, 206
unit/gedragstests, 3 betalingsintegratietests, volledige workspacebuild, 158
migraties op twee databases, dependencyaudit zonder kwetsbaarheden,
secretscan, publieke browser-smoke en vier echte publieke visuele baselines.

De instructeursapp heeft een Nederlandse canonieke routetree, tablet/mobile
cockpit, live counts, centrale Next Best Action, Lesson Cockpit, autosave,
versleutelde offline concepten en leerlingcreatie zonder verplicht
e-mailadres. Readiness en moduletoetsen gebruiken één evidencegedreven engine;
RIS-stappen en `N` worden niet als kwaliteitsscore behandeld.

De repository bevat een API-36 Capacitor-shell voor
`io.nxtdrive.instructeur`. Android unit, lint en staging-bundle zijn in een
Android-36-container groen. Het staging-AAB is debug-ondertekend en is
uitdrukkelijk geen productieartefact. Een production-signed AAB, echte
geauthenticeerde storescreenshots en Play-upload blijven geblokkeerd op externe
credentials/goedkeuring. Daarom wordt niet geclaimd dat de app al Play
Store-ready of volledig Definition-of-Done is.

## 2. Baseline

De reproduceerbare beginsituatie staat in
`docs/audit/mega-sprint-baseline.md` en `artifacts/baseline/`.

- Node `v24.18.0`, pnpm `10.26.1`.
- 154 migraties vóór de sprint; 158 na de sprint.
- Baselinebuild en typecheck waren groen.
- Baseline unit: 158/159; factuurdatum was de bekende fout.
- Productieaudit: 0 critical, 6 high, 7 moderate, 1 low.
- Geen harde format/lint/E2E/visual/migratie/release-evidencepoort.
- Geen Android-project; bestaande PWA-screenshots waren placeholders.
- 29 handgeschreven bestanden boven 800 regels.

## 3. Wijzigingen per domein

- Release: gepinde Node/pnpm, harde scripts, acht verplichte workflows,
  Dependabot, migratiesmoke, audit, secretscan, SBOM en evidencegenerator.
- Tijd: `Clock`, `SystemClock`, `FixedClock` en tenanttijdzone voor
  factuurstatus/datum.
- Security: requestnonce-CSP, Permissions Policy, HSTS, veilige headers,
  correlation IDs, database-gedistribueerde rate limiting en veilige uploads.
- Privacy: export- en verwijderrequests, tijdelijke private exports,
  anonimisering, legal hold, bewaarbeleidpreview/dry-run en audit.
- Observability: gestructureerde geredigeerde logs, W3C trace/span IDs,
  optionele OTLP-export, error boundary en live/ready/version.
- Offline: versleutelde conceptopslag, idempotente sync, revisies en
  safety-first conflictgedrag.
- Product: AI standaard uit, optionele leerling-e-mail, trainingsenrollment,
  canonieke instructeur- en leerlingroutes.

## 4. Routes vóór en na

Publieke canonieke bases zijn nu `/instructeur/**` en `/leerling/**`.
`lib/routes.ts` combineert instructeur- en leerlingdefinities met canoniek pad,
aliases, label, analyticskey, rollen, entitlements, featureflag en visibility.
Middleware leidt geregistreerde aliases rechtstreeks met HTTP 308 om en behoudt
queryparameters. Browser-smoke bewijst onder meer:

- `/instructor/messages/thread-42?tab=ongelezen` →
  `/instructeur/berichten/thread-42?tab=ongelezen`;
- `/student/lessons/lesson-42?tab=focus` →
  `/leerling/lessen/lesson-42?tab=focus`.

De hoofdnavigaties en PWA-manifests wijzen naar de Nederlandse routes.
`nxtdrive.io` is de canonieke origin; `app.nxtdrive.io` blijft alleen als
permanente infrastructuurredirect voor bestaande bookmarks.

## 5. RIS/readinessimplementatie

De centrale `evaluateReadiness`-engine normaliseert evidence voor `STANDARD`,
`RIS_2_0` en `RIS_1_0_LEGACY`. De engine scheidt mastery, independence,
coverage, safety, prerequisites, stability, regression en assessments.

- `N` betekent unobserved en verlaagt alleen dekking.
- RIS-instructiestap 1–8 verhoogt geen mastery en wordt niet gemiddeld.
- Critical/safety blockers kunnen niet worden gecompenseerd.
- Uitkomsten bevatten reason- en evidence-ID’s.
- Inputs en snapshots zijn deterministisch en immutable.
- Readiness blijft shadow zolang curriculum/policy geen echte expert-hash
  hebben.
- RIS 1.0 is import/history/export/shadow-only en niet actief voor nieuwe
  lessen, enrollments of toetsen.

## 6. Moduletoetsen

De moduletoetslaag heeft expliciete lifecycle, versieerbare definities,
criteria, decisions, publicatiegrens, audited overrides en retests als nieuw
attempt. Een open safety blocker is standaard niet overridebaar.
`readyForModuleTest` wordt niet gebruikt als stille beslisboolean. Leerlingen
zien alleen `PUBLISHED`.

## 7. Instructeursflow

De canonieke app bevat cockpit, agenda, Lesson Cockpit, leerlingen, berichten,
taken, beschikbaarheid, theorie, instellingen, help en release notes.

- Volgende actie staat bovenaan en komt uit live context.
- Badges gebruiken live counts.
- Lesson Cockpit opent op `Snel afronden`.
- Formcontrols hebben minimaal 44px bediening.
- Autosave en offline conceptstatus zijn aanwezig.
- Logout wist lokale versleutelde concepten.
- Nieuwe leerling vereist naam en privacybevestiging, maar geen e-mail of
  fictief authaccount.
- Enrollment is `STANDARD` of `RIS_2_0`; `RIS_1_0_LEGACY` wordt geblokkeerd.

Een echte stopwatchmeting van de volledige 60-secondenflow met een pilotaccount
is nog niet uitgevoerd; zie externe-actietabel.

## 8. Security

- Nonce-CSP met `strict-dynamic`, zonder `unsafe-eval`.
- Permissions Policy ontzegt camera, microfoon, locatie en overige niet
  gebruikte capabilities.
- HSTS in productie, nosniff, frame-, referrer- en cross-originheaders.
- Correlation ID wordt gevalideerd en doorgegeven.
- Rate limits voor auth, invites, uploads, privacy, assessments, readiness,
  notifications en offline sync leven in PostgreSQL.
- Uploads controleren magic bytes, EICAR en een configureerbare malwarescanner;
  productie faalt gesloten zonder scanner.
- Privacy- en uploadroutes leiden tenant/user uit de sessie af en bevatten
  IDOR-guards.
- Productieaudit: 0 info/low/moderate/high/critical.

## 9. Dependencyresultaten

Next.js is `15.5.22`; Sharp `0.35.3`; PostCSS `8.5.24`; `qs` `6.15.3`;
`body-parser` `2.3.0`. `pnpm audit --prod --json` rapporteert 340
productieafhankelijkheden en nul bekende kwetsbaarheden. De lockfile is
reproduceerbaar met `pnpm install --frozen-lockfile`.

## 10. Privacy

`privacy_requests`, legal holds, bewaarbeleidversies/runs en privacy-audit
hebben RLS en service-only mutaties. Export is tenantgefilterd, gaat naar een
private bucket en gebruikt tijdelijke signed URLs met downloadaudit.
Anonimisering bewaart financiële/auditrelaties en stopt bij legal hold.

Onbekende bewaartermijnen blijven `null`/`LEGAL_REVIEW`; er is geen juridische
goedkeuring verzonnen. Publieke routes zijn `/privacy`, `/voorwaarden`,
`/account-verwijderen` en `/beveiliging`.

## 11. Observability

Structured logging redigeert gevoelige velden en serialiseert alleen veilige
errorvelden. Trace en span IDs zijn W3C-compatibel. OTLP kan vendorneutraal via
environment worden geactiveerd; stdout is de fallback. Endpoints:

- `/health/live`;
- `/health/ready`;
- `/health/version`;
- `/api/health` als compatibiliteitsalias.

Readiness controleert configuratie, database, verwachte schemafeatures,
notification outbox en object storage zonder ruwe databasefouten te lekken.

## 12. Android

Capacitor 8-shell:

- appnaam `NXTDRIVE Instructeur`;
- package/namespace `io.nxtdrive.instructeur`;
- min SDK 24, compile/target SDK 36;
- debug, staging en production buildtypes;
- geen cleartext, backup uit, geen oriëntatielock;
- verified links voor `https://nxtdrive.io/instructeur/**`;
- Android Keystore/AES-GCM-plugin voor lokale secrets;
- production signing uitsluitend via vier environmentsecrets.

Containerbewijs (`ghcr.io/cirruslabs/android-sdk:36`, Gradle 8.14.5):
`testDebugUnitTest testStagingUnitTest lintDebug lintStaging bundleStaging`
PASS, 228 tasks. Het staging-AAB is 3,174,473 bytes met SHA-256
`6d8ec44645a7fa0a7c50ec52b30a921f00d1368c8f5fc374b4f14cb7cce12332`.
De debugcertificaatfingerprint is
`BF:84:AE:28:1D:F1:90:EB:C3:E2:73:70:3D:17:F9:37:B6:B6:88:0E:18:18:7E:D4:62:23:01:69:3D:EB:D7:BC`.
Deze fingerprint is niet geschikt voor productie.

`bundleProduction` faalt bewust wanneer upload-keyvariabelen ontbreken. Er is
dus lokaal geen production-signed AAB.

## 13. Play Store

Aanwezig: internal- en productionworkflow, protected environments, exact
artifact/checksum-hergebruik, default staged rollout 10%, metadata, listing,
release notes, icon, feature graphic, Data Safety- en permissionsinventaris,
reviewerinstructies en privacy/deletion-checklists.

De volledige assetvalidator blokkeert terecht zolang niet minimaal twee echte
phone-, 7-inch- en 10-inch-captures aanwezig zijn. Er is geen Play-upload
uitgevoerd.

## 14. Testresultaten

| Gate                          | Resultaat                                       |
| ----------------------------- | ----------------------------------------------- |
| Frozen install                | PASS                                            |
| Format                        | PASS                                            |
| Repositorylint                | PASS                                            |
| Roottypecheck                 | PASS                                            |
| Unit/gedrag                   | PASS, 206/206                                   |
| Betalingsintegratie           | PASS, 3/3                                       |
| Workspacebuild                | PASS                                            |
| Migratiesmoke                 | PASS, 158 empty + populated upgrade             |
| Productieaudit                | PASS, 0 kwetsbaarheden                          |
| Secretscan                    | PASS                                            |
| Actionlint                    | PASS voor de nieuwe workflows                   |
| Publieke browser-smoke        | PASS                                            |
| Visuele regressie             | PASS, 4/4                                       |
| Android unit/lint/staging AAB | PASS                                            |
| Authenticated business E2E    | NIET UITGEVOERD: staging/testaccounts ontbreken |
| Production-signed AAB         | GEBLOKKEERD: upload key ontbreekt               |
| Volledige Play-assetvalidatie | GEBLOKKEERD: echte appcaptures ontbreken        |

Een losse vroege PGlite-integratierun had één niet-reproduceerbare Node/V8-crash;
de onmiddellijke retry, de volledige unitset en de finale integratiegate waren
groen. Volgen als CI dit herhaalt.

## 15. Performance

De finale Next-build rapporteert:

- `/instructeur`: 120 kB first load;
- `/leerling`: 157 kB first load;
- `/backoffice`: 216 kB first load;
- shared first load: 103 kB;
- middleware: 91.8 kB.

De routebudgetpoort is groen zonder budgetverhoging: respectievelijk 155, 170,
290, 110 en 95 kB. De backoffice daalde van 316 naar 216 kB door de
Recharts-runtime voor de kleine omzettrend te vervangen door toegankelijke
native balken. Er is geen productie-RUMmeting uitgevoerd.

## 16. Toegankelijkheid

Zoom- en oriëntatieblokkades zijn verwijderd. Belangrijke mobiele bediening is
minimaal 44px; loadingstates hebben `aria-busy`/live tekst; forms behouden
labels. Browser-smoke bewijst op 390×844 geen horizontale overflow voor login,
privacy, beveiliging en accountverwijdering. Een geauthenticeerde axe/screen
reader-pilot is nog een concrete testactie.

## 17. Screenshots

Goedgekeurde echte publieke regressiebaselines staan in
`scripts/visual-baselines/`:

- login desktop 1440×1000;
- login mobile 390×844;
- privacy tablet 1024×1366;
- account deletion mobile 390×844.

De eerdere 404-baselines zijn verwijderd. Placeholder-PWA-afbeeldingen worden
niet meer vanuit manifests geadverteerd. Storecaptures van echte
geauthenticeerde functionaliteit ontbreken bewust en worden niet gefingeerd.

## 18. Release-evidence

`release-evidence/` bevat:

- CycloneDX 1.6 SBOM;
- dependencyaudit;
- git- en releasemanifest;
- migratiemanifest met SHA-256 per migratie;
- build/store-assetchecksums;
- expliciet als `staging-dry-run` gelabeld AAB-bewijs;
- test-, E2E- en visual summaries;
- bekende externe blokkades.

Deploymentstatus is `not-deployed`; production signingfingerprint is `null`.

## 19. Migraties

Nieuwe migraties:

1. `20260729090000_security_privacy_foundation.sql`;
2. `20260729093000_offline_lesson_drafts.sql`;
3. `20260729143000_training_readiness_assessment_foundation.sql`;
4. `20260729143100_ris_observations_and_publication_guards.sql`.

De smoke maakt twee disposable PostgreSQL/Supabase-17 databases: één volledig
leeg en één met alle voorgaande migraties plus representatieve tenant-, user-,
student-, lesson- en invoicefixture. Daarna controleert hij migratierecords,
RLS, tenantisolatie, foreign keys en unieke constraints.

## 20. Resterende externe acties

| Taak                           | Reden                                               | Technisch gereed                                      | Externe afhankelijkheid                        | Concrete volgende actie                                             | Eigenaar                   | Risico                                | Blokkerend                              |
| ------------------------------ | --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | ------------------------------------- | --------------------------------------- |
| RIS-inhoud activeren           | Geen echte deskundigegoedkeuring                    | hash/guard/shadow/publishflow                         | bevoegde RIS-deskundige                        | valideer 46 scripts, toetslogica en rechten; registreer signed hash | product owner + deskundige | inhoudelijk onjuiste opleiding        | ja voor actieve RIS-publicatie          |
| Bewaartermijnen goedkeuren     | termijnen zijn juridisch, niet technisch            | null-safe policy, preview, dry-run, legal hold, audit | privacy/juridische goedkeuring                 | vul en keur policyversie goed                                       | privacy owner              | onjuiste bewaring                     | ja voor automatische uitvoering         |
| Data Safety/privacy goedkeuren | repository kan juridische juistheid niet bevestigen | inventory en publieke routes                          | juridisch/eigenaar                             | review, corrigeer en sign-off                                       | privacy owner              | Play rejection/compliance             | ja voor Play                            |
| Package-ID bevestigen          | bestaand Play-package kan niet lokaal worden gezien | `io.nxtdrive.instructeur` overal consistent           | Play Console-rechten                           | controleer package vóór eerste upload                               | Play owner                 | onomkeerbare verkeerde identity       | ja                                      |
| Production signing             | upload key ontbreekt                                | fail-closed Gradle/workflows                          | vier signingsecrets                            | genereer/bewaar upload key en configureer protected secrets         | release owner              | geen uploadbaar AAB                   | ja                                      |
| Play API                       | serviceaccount ontbreekt                            | gepinde uploadactie en protected workflows            | serviceaccountsecret/rechten                   | configureer minimaal Play-recht                                     | Play owner                 | geen trackupload                      | ja                                      |
| Asset Links productiehash      | Play signinghash onbekend                           | env-gedreven endpoint zonder placeholders             | Play App Signing-fingerprint                   | zet fingerprintsecret en verifieer deep link                        | release owner              | link niet verified                    | ja                                      |
| Echte storecaptures            | alleen publieke baselines kunnen lokaal             | validator en vereiste mappen                          | exact signed build + synthetisch reviewaccount | capture phone/7"/10", review en laat validator slagen               | QA + Play owner            | storelisting blokkeert                | ja                                      |
| Revieweraccount                | geen externe credentials maken                      | template en instructies                               | beveiligd testaccount                          | maak least-privilege account met synthetische data                  | QA owner                   | review kan niet inloggen              | ja                                      |
| Authenticated E2E/pilot        | geen bereikbare test-Supabase/accounts in deze run  | business-flow runner en fixtures bestaan              | staging URL + secrets/accounts                 | seed staging, draai volledige suite incl. 60s/offline/publicatie    | QA owner                   | regressies achter auth kunnen blijven | ja voor volledige DoD                   |
| Productieobservability         | providerkeuze niet afleidbaar                       | OTLP-adapter/logging/health gereed                    | OTLP endpoint/credentials en alert ownership   | verbind collector en test alarmrouting                              | operations                 | verminderde incidentdetectie          | niet voor codepilot, wel voor productie |

## 21. Invloedrijke beslissingen

- ADR-001: vendorneutrale security- en observabilityfoundation.
- ADR-002: privacyretentie en anonimisering zonder verzonnen termijnen.
- ADR-003: evidencegedreven readiness en assessments.
- Nederlandse publieke routes, Engelse interne domeinnamen.
- PostgreSQL als gedeelde rate-limitbron in plaats van instance-memory.
- Native Keystore of niet-exporteerbare browser CryptoKey voor offline drafts.
- Readiness shadow-by-default tot echte expertvalidatie.
- Grote bestaande bestanden alleen met expliciet register en test-first
  refactortrigger; zie `docs/architecture/large-file-exceptions.md`.

## 22. Exacte commando’s om opnieuw te valideren

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm migration:smoke
pnpm security:audit
pnpm security:secrets
pnpm build

E2E_BASE_URL=http://127.0.0.1:22557 \
  pnpm --filter @workspace/scripts run e2e:release-smoke

NXTDRIVE_VISUAL_BASE_URL=http://127.0.0.1:22557 \
  pnpm --filter @workspace/scripts run visual:regression

pnpm --filter @workspace/scripts run check-route-performance
pnpm --filter @workspace/nxtdrive exec node scripts/validate-play-assets.mjs --metadata-only
pnpm release:evidence
```

Android-container:

```bash
cd artifacts/nxtdrive/android
./gradlew --no-daemon \
  testDebugUnitTest testStagingUnitTest lintDebug lintStaging bundleStaging
```

Production vereist de vier `ANDROID_UPLOAD_*` variabelen en daarna
`./gradlew --no-daemon bundleProduction`.

## 23. Relevante commit-SHA’s

- Baseline en huidige HEAD:
  `5f4c94d63d1dc0b1bd4656a44b19cf6a6abdccf4`.
- Deze sprintwijzigingen zijn niet gecommit. Er zijn daarom geen nieuwe
  commit-SHA’s en er wordt geen onbestaande releasecommit geclaimd.
