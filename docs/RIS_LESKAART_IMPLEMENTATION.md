# RIS-leskaart implementatie

## Doel

NXTDRIVE ondersteunt met deze foundation een RIS-native digitale leskaart naast
de bestaande legacy-leskaart. De huidige 1-10 CBR-aligned leskaart blijft
bestaan totdat een tenant expliciet overstapt naar RIS.

De kernkeuze is bewust niet-destructief:

- `lesson_card_mode = legacy` blijft de default.
- `lesson_card_mode = ris` activeert RIS per tenant.
- AI mag voorstellen doen, maar de instructeur bevestigt en publiceert.
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
RIS-native scriptbeoordeling in plaats van de legacy 1-10 skill scoring.

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
- leerlingvriendelijke samenvatting en huiswerk/volgende focus worden bevestigd
  door de instructeur;
- AI-assisted voorstel wordt als bewerkbare tekst gepresenteerd, niet automatisch
  gepubliceerd;
- `publishRisLessonCardAction` publiceert handmatig;
- Publicatie kopieert conceptscores naar definitieve scores en recomputet
  `student_ris_progress`;
- in RIS-modus kan de les pas worden afgerond nadat de RIS-leskaart gepubliceerd
  is.

### RIS-5: Leerlingweergave

De student PWA toont RIS-voortgang leerlingvriendelijk zodra een tenant
`lesson_card_mode = ris` gebruikt.

Geimplementeerd:

- `/student/voortgang` schakelt per tenantmodus tussen legacy-leskaart en
  RIS-weergave;
- student PWA toont RIS-voortgang als roadmap, moduleprogressie en
  gepubliceerde feedback;
- modulekaarten tonen voortgang, beoordeelde scripts, aandachtspunten en
  toetsklaar-status;
- scriptvoortgang wordt vertaald naar leerlingtaal, bijvoorbeeld
  `Stap 5 van 8 - bijna zelfstandig`;
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

## Nog niet geimplementeerd

De bestaande legacy-leskaart blijft zichtbaar voor tenants met
`lesson_card_mode = legacy`. De volgende sprints sluiten hierop aan:

### RIS-8: AI en rapportage

AI werkt bovenop gestructureerde RIS-data:

- leerlingvriendelijke samenvatting
- volgende-les focus
- zwakke scripts
- moduleadvies
- interne aandachtspunten

AI publiceert nooit zelfstandig.

### RIS-9: Migratie en rollout

Optionele mapping van bestaande `skill_taxonomy` en scores naar RIS-scripts:

- mapped items automatisch voorstellen
- unmapped items rapporteren
- RIS per tenant pas aanzetten na migratiecheck

### RIS-10: Hardening en release

- RLS-tests
- E2E instructor/student/backoffice flows
- performancecheck
- regressietest voor legacy-leskaart
- handleiding voor instructeur en tenant admin
- productie-runbook

## Test

De statische guard-test staat in:

```bash
pnpm --filter @workspace/scripts run test-ris-foundation
```

Deze test bewaakt:

- schema/RLS/RPC-contracten
- service-role-only RPC's
- opt-in RIS-modus
- concept-vs-publicatiegedrag
- pure RIS-engine
- Next loaders/actions
- documentatie en package scriptregistratie
