# RIS-leskaart implementatie

## Doel

NXTDRIVE ondersteunt met deze foundation een RIS-native digitale leskaart naast
de bestaande legacy-leskaart. RIS is de standaard voor nieuwe tenants; de
oude legacy-leskaart blijft beschikbaar als expliciete fallback
voor tenants die nog niet willen overstappen.

De kernkeuze is bewust niet-destructief:

- `lesson_card_mode = ris` is de default voor nieuwe tenants.
- `lesson_card_mode = legacy` houdt de bestaande legacy-leskaart beschikbaar als
  fallback.
- AI is tijdelijk hard uitgeschakeld; verklaarbare, regelgestuurde voorstellen
  blijven beschikbaar en de instructeur bevestigt en publiceert.
- Conceptscores zijn staff-only.
- Leerlingen zien alleen gepubliceerde, leerlingvriendelijke voortgang.

## Geimplementeerde foundation

### Database

De migration `20260616104647_ris_lesson_card_foundation.sql` voegt de volgende
RIS-tabellen toe:

- `ris_versions`
- `ris_modules`
- `ris_categories`
- `ris_scripts`
- `ris_script_variants`
- `ris_step_definitions`
- `tenant_ris_settings`
- `ris_lesson_cards`
- `ris_script_assessments`
- `student_ris_progress`
- `ris_lesson_observations`
- `ris_guided_reflections`
- `ris_module_tests`

Alle tabellen hebben RLS, tenant-isolatie waar relevant, indexes en auditlog
voor mutaties.

### Seeddata

De migration seedt een standaardcatalogus `RIS 2.0 - Rijbewijs B` met:

- 4 modules
- modulecategorieen
- scripts `M1-S1` t/m `M4-S46`
- scriptvarianten voor bijzondere verrichtingen
- RIS-stappen `N` en `1` t/m `8`

Deze catalogus bevat korte labels en structuur, geen volledige boekcontent.

### RPC-contracten

De volgende service-role RPC's vormen het server-side contract:

- `seed_default_ris_taxonomy`
- `set_tenant_ris_settings`
- `set_ris_concept_score`
- `publish_ris_lesson_card`
- `set_guided_reflection`
- `set_ris_module_test`
- `recompute_student_ris_progress`

Belangrijke regels:

- RIS-scores schrijven kan alleen als de tenantmodus `ris` is.
- Conceptscores kunnen alleen op draft-leskaarten.
- Publicatie kopieert conceptscores naar definitieve scores.
- Studentprogress wordt pas na publicatie bijgewerkt.
- Student/guardian RLS ziet alleen gepubliceerde kaarten en progress.

### Pure leskaart-engine

`@workspace/leskaart` bevat nu RIS-helperlogica in `src/ris.ts`:

- `RISStep = "N" | 1..8`
- `normalizeRisStep`
- `translateRisStepForStudent`
- `buildRisTree`
- `computeRisProgress`
- `computeRisModuleReadiness`
- `evaluateReadiness` voor de centrale, methode-onafhankelijke beslisgrens

Deze laag is pure TypeScript en heeft geen Supabase- of Next-afhankelijkheid.

### Next loaders en actions

`artifacts/nxtdrive/lib/ris` bevat herbruikbare servercode:

- `loadTenantRisSettings`
- `loadRisCatalog`
- `loadInstructorRisLessonCard`
- `loadStudentRisProgress`
- `loadBackofficeRisOverview`
- `setTenantRisSettingsAction`
- `setRisConceptScoreAction`
- `setGuidedReflectionAction`
- `publishRisLessonCardAction`
- `setRisModuleTestAction`

De actions zijn dun: Next controleert de actieve tenant/rol, de RPC's doen de
definitieve autorisatie en state-transities.

## Geimplementeerde UI-integratie

### RIS-3: Instructeur RIS-lesmodus

Voor tenants met `lesson_card_mode = ris` toont de instructeurpagina nu een
RIS-native scriptbeoordeling in plaats van de legacy skill scoring.

Geimplementeerd:

- de instructeurles laadt naast legacy-leskaartdata ook RIS-context;
- RIS-tenants krijgen de N/1-8 scriptkaart;
- legacy-tenants blijven de bestaande `SkillScoring` gebruiken;
- filters voor Alles, Focus, Aandacht en Module 1-4;
- conceptscores worden opgeslagen via `setRisConceptScoreAction`;
- conceptflags voor focus, aandacht, herhalen en toetsklaar;
- gepubliceerde/gearchiveerde leskaarten zijn read-only;
- de legacy afrondwizard wordt in RIS-modus vervangen door een RIS-flow:
  start les, open RIS-scorekaart, publicatiecontrole, les afronden.

### RIS-4: Les afronden en publicatie

De instructeurflow bevat nu een publicatiepaneel onder de RIS-scorekaart.

Geimplementeerd:

- behandelde scripts worden als publicatiecontrole getoond;
- publicatie vereist minimaal een conceptscore;
- publicatie is draft-only en kan niet opnieuw over gepubliceerde kaarten heen;
- begeleide reflectie wordt opgeslagen via `setGuidedReflectionAction`;
- de invoerwijze wordt auditbaar vastgelegd als `student_self` of
  `instructor_assisted`, inclusief invoerende gebruiker en capture-surface;
- leerlingvriendelijke samenvatting en huiswerk/volgende focus worden bevestigd
  door de instructeur;
- het volgende-lesvoorstel combineert de laatste beoordeling, open dekking,
  veiligheidsaandacht, herhaalpunten en leerlingwens tot 2-4 verklaarde
  focusscripts die de instructeur bevestigt;
- `publishRisLessonCardAction` publiceert handmatig;
- Publicatie kopieert conceptscores naar definitieve scores en recomputet
  `student_ris_progress`;
- in RIS-modus kan de les pas worden afgerond nadat de RIS-leskaart gepubliceerd
  is.

### RIS-5: Leerlingweergave

De student PWA toont RIS-voortgang leerlingvriendelijk zodra een tenant
`lesson_card_mode = ris` gebruikt.

Geimplementeerd:

- `/leerling/voortgang` schakelt per tenantmodus tussen legacy-leskaart en
  RIS-weergave;
- student PWA toont RIS-voortgang als roadmap, moduleprogressie en
  gepubliceerde feedback;
- modulekaarten tonen voortgang, beoordeelde scripts, aandachtspunten en
  toetsklaar-status;
- instructiestap, beheersing, dekking en kritieke blokkades worden afzonderlijk
  gepresenteerd en niet samengevoegd tot een examenpercentage;
- de leerling ziet laatst geoefende scripts met link naar het lesdetail;
- gepubliceerde leskaarten tonen instructeurfeedback, huiswerk/volgende focus
  en begeleide reflectie;
- conceptscores, interne samenvatting en interne instructeurscontext blijven
  verborgen voor leerlingen.

### RIS-6: Admin/backoffice

De backoffice heeft nu een RIS-cockpit op `/backoffice/ris`.

Geimplementeerd:

- branch-scope aware loader voor RIS-overzichten;
- service-role batchread na expliciete `student:read` permissiecontrole;
- RIS-overzichten voor leerlingen per module;
- aandachtspunten per leerling/script;
- toetsklaar-status op module- en scriptniveau;
- niet-gepubliceerde leskaarten als operationele opvolglijst;
- moduletoetsen met type, resultaat, datum en instructeur;
- instructeur-opvolging voor drafts, aandachtspunten en toetsklare scripts;
- route toegevoegd aan backoffice navigatie en route-info bubble.

### RIS-7: Moduletoetsen en CBR-koppeling

De backoffice kan RIS-moduletoetsen en CBR-momenten vastleggen via
`/backoffice/ris`.

Geimplementeerd:

- Toets 1 en Toets 2 als interne instructeurstoetsen;
- RIS-toets CBR en RIS-examen CBR als expliciete CBR-momenten;
- status/resultaat: gepland, behaald, niet behaald, herhalen en geannuleerd;
- CBR-referentie, notities en vrijstelling bijzondere verrichtingen;
- branch-scope aware writes via leerlingtoegang voordat service-role RPC schrijft;
- agenda-prefill naar `/backoffice/agenda/afspraak/nieuw`;
- RIS-toets/TTT-momenten linken naar `interim_test`;
- RIS-examen CBR linkt naar `exam`.

### RIS-8: Verklaarbare signalen en rapportage

Modelgestuurde AI is tijdelijk op productniveau uitgeschakeld, ook als een oude
deployment nog een AI-environmentflag bevat. De rapportage blijft volledig
bruikbaar met uitlegbare, deterministische regels.

Geimplementeerd:

- harde globale AI-pauze en databaseguard op `ai_assist_enabled`;
- leerlingvriendelijke, door de instructeur bevestigde samenvatting;
- verklaarde huiswerk/volgende-les focus;
- interne staff-only samenvatting en aandachtspunten;
- de instructeur controleert, past aan en publiceert handmatig;
- backoffice RIS-rapportage met zwakke scripts, moduleadvies en interne
  opvolgpunten;
- deterministische rapportage zonder AI-configuratie of externe modelcall.

### RIS-9: Migratie en rollout

RIS kan per tenant gecontroleerd worden aangezet met een migratiepreflight op
`/backoffice/ris`.

Geimplementeerd:

- migratierapport dat bestaande `skill_taxonomy` leaf-skills vergelijkt met de
  actieve RIS-catalogus;
- analyse van `student_skill_scores` om alleen gescoorde legacy-onderdelen als
  migratiekritiek te behandelen;
- heuristische mapping-suggesties met confidence: high, medium of none;
- unmapped gescoorde onderdelen worden zichtbaar gerapporteerd;
- verweesde legacy-scores blokkeren activatie;
- veilige migratie-activatie na een groene preflight voor tenants met echte
  historische scoredata;
- activatie blijft tenant-admin-only en loopt via de bestaande
  `set_tenant_ris_settings` RPC;
- de preflight toont checklist, scorecounts, mapped/unmapped aantallen,
  RIS-catalogusstatus en bestaande RIS-publicaties;
- expliciete clean-start route voor mock-data: tenant admin typt
  `SCHOON STARTEN`, waarna alleen `lesson_skill_scores` en
  `student_skill_scores` voor die tenant worden gewist en RIS wordt
  geactiveerd;
- tenants met `lesson_card_mode = legacy` blijven veilig op de bestaande
  legacy-leskaart als fallbackmodus.

RIS-9 migreert nog geen historische scores naar nieuwe definitieve
`student_ris_progress` rows. De eerste release kiest bewust voor gecontroleerde
rollout en transparantie. Automatische scoreconversie kan later als aparte,
tenant-specifieke migratie plaatsvinden zodra mappingregels inhoudelijk zijn
goedgekeurd.

### RIS-10: Hardening en release

RIS heeft nu een expliciete release gate voor productieactivatie.

Geimplementeerd:

- RLS-releaseguard voor gepubliceerde RIS-leskaarten, scriptassessments,
  studentprogress en begeleide reflectie;
- aparte migration die gepubliceerde begeleide reflectie zichtbaar maakt voor
  de gekoppelde leerling/ouder, terwijl interne observaties staff-only blijven;
- legacy-regressieguard: instructeur- en studentroutes moeten per tenantmodus
  blijven schakelen tussen legacy en RIS;
- E2E-releaseguard die bevestigt dat de bestaande business-flow suite tenant
  admin, instructeur, leerling, lesafronding, branch isolation en session
  retention blijft dekken;
- performance-releaseguard die `check-route-performance` als livegangbudget
  bewaakt voor student, instructor en backoffice shells;
- productie-runbook met RIS release gate, minimale handmatige RIS-smoke en RIS
  rollback via `lesson_card_mode = legacy`;
- `test-ris-release-hardening` als samengevoegde statische guard voor de
  release-eisen.

RIS is de standaard voor nieuwe tenants. De bestaande legacy-leskaart blijft
zichtbaar voor tenants met `lesson_card_mode = legacy`. Tenant admins kunnen
mock-scoredata schoon verwijderen en daarna RIS activeren zonder mapping; echte
historische klantdata hoort via de preflight/mapping route te gaan.

## Open release gates

De technische RIS-basis en releaseguards zijn geïmplementeerd. Dit is geen claim
dat inhoudelijke RIS-goedkeuring of een gebruikerstest is afgerond. De volgende
externe bewijzen blijven blokkeren voor een brede RIS-livegang:

- ondertekende validatie door een bevoegde RIS-deskundige van de 46 scripts,
  benamingen, stapteksten, moduletoetslogica en bron-/gebruiksrechten;
- een gemeten instructeurstest die bevestigt dat het snelle afrondpad in een
  normale les binnen 60 seconden kan worden voltooid; de applicatie registreert
  daarvoor starttijd, duur en het 60-secondenresultaat in de audittrail;
- een geslaagde authenticated stagingreis met een expliciet als
  expert-gevalideerd gemarkeerde RIS-testtenant.

Resterende toekomstige uitbreidingen:

- automatische historische scoreconversie naar definitieve RIS-progress;
- volledige RIS-boekcontent of commerciele lesstof;
- CBR-export of externe CBR-koppeling;
- tenant-specifieke handmatige mapping-editor voor unmapped legacy-items;
- aanvullende productie-E2E met echte accounts na de staginggate.

## Test

De statische guard-test staat in:

```bash
pnpm --filter @workspace/scripts run test-ris-foundation
pnpm --filter @workspace/scripts run test-ris-ai-reporting
pnpm --filter @workspace/scripts run test-ris-migration-rollout
pnpm --filter @workspace/scripts run test-ris-release-hardening
```

Deze test bewaakt:

- schema/RLS/RPC-contracten
- service-role-only RPC's
- opt-in RIS-modus
- concept-vs-publicatiegedrag
- pure RIS-engine
- Next loaders/actions
- documentatie en package scriptregistratie
