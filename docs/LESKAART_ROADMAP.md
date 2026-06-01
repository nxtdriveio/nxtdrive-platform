# NXTDRIVE Leskaart — Gefaseerd plan (enterprise)

> Bron van waarheid voor _wat_ de leskaart wordt: `docs/NXTDRIVE_LESKAART_CANON.md`.
> Dit document beschrijft _in welke fases_ we het bouwen. Lees beide samen met
> `docs/NXTDRIVE_CANON.md` en `docs/PHASE_PLAN.md`.

Laatst bijgewerkt: 2026-06-01

---

## Visie

De leskaart is geen checklist maar het **volledige opleidingsdossier** van de leerling.
Het systeem geeft continu antwoord op één vraag: **hoe examenrijp is deze leerling nu?**

Twee ervaringen, één dossier:
- **Instructeur — tablet-first.** Snel sturen op ontwikkeling tijdens/na de les: per
  vaardigheid een cijfer 1–10, kritieke skills bewaken, lesregistratie, examenadvies.
- **Leerling & ouder — mobile-first.** Perfect inzicht en motivatie: voortgang per
  categorie, examenrijpheidsmeter, feedback per les, trend over tijd.

Richting: **enterprise** — visueel strak, informatiedicht maar rustig, snelle acties,
white-label-bewust, AI- en rapportage-ready. Referentiebeelden (Van Dijk-mockups) zijn
uitsluitend visuele inspiratie; in code nooit een specifieke rijschool hardcoden.

---

## Belangrijke ontwerpbesluiten (uit de canon)

1. **Beoordelingsschaal 1–10** met expliciete niveaubetekenis (1 = nooit behandeld …
   10 = volledig beheerst). Niveau 8 = "bijna examenwaardig", 9 = "examenwaardig".
2. **Examenrijpheid is cijfer-gedreven** (adviserend):
   - Niet examenrijp: kritieke onderdelen < 7 of gemiddelde < 7.
   - Bijna examenrijp: kritieke ≥ 8 en gemiddelde ≥ 7,5.
   - Examenwaardig: kritieke ≥ 8, gemiddelde ≥ 8, laatste 3 lessen stabiel, theorie
     behaald, machtiging geregeld, gezondheidsverklaring (indien nodig).
   - **Dit vervangt het eerdere besluit "geen drempel, behaald-vinkje overruled".**
     De readiness komt nu uit de cijfers; de instructeur blijft eindverantwoordelijk.
3. **Exam Readiness Score 0–100%** met 5 fasen: Beginfase (0–25), Ontwikkelfase
   (26–50), Gevorderd (51–75), Bijna examenrijp (76–90), Examenwaardig (91–100).
4. **Hiërarchische taxonomie**: 10 hoofdcategorieën → subcategorieën → vaardigheden.
   De huidige `cbr_competencies` is plat en moet hiërarchisch + CBR-aligned worden.
5. **Kritieke veiligheidsvaardigheden** (kijkgedrag, voorrang, snelheidsaanpassing,
   positie, besluitvorming, gevaarherkenning) mogen bij examenadvies nooit < 8.
6. **Theoriekoppeling** per vaardigheid (bv. Rotondes → Theorie: Rotondes & Voorrang).
7. **Lesregistratie** per les: datum, tijd, instructeur, voertuig, locatie, behandelde
   onderdelen, gewijzigde scores, leerlingnotitie, interne notitie, aandachtspunten,
   theoriehuiswerk, examenadvies-update.

---

## Relatie tot bestaande taken

De reeds opgevoerde taken **Module-cijfers #37–#40** zijn de *kiem* van Fase L0/L2/L3,
maar gingen uit van een platte competentielijst zonder drempel. Met deze canon worden ze
opgevolgd door het hiërarchische, cijfer-gedreven model hieronder. Voorstel: #37–#40
intrekken/herplannen en vervangen door de L-fasen, zodat we niet twee keer bouwen.

---

## Fasen

### Fase L0 — Skill-taxonomie & scoremodel (datalaag) · fundering
- Hiërarchische, tenant-scoped taxonomie: hoofdcategorie → subcategorie → vaardigheid;
  default CBR-aligned seed (10 hoofdcategorieën uit de canon), tenant mag uitbreiden;
  versiebeheer zodat een lopend dossier stabiel blijft.
- Markering **kritieke veiligheidsvaardigheid** per vaardigheid.
- Optionele **theoriekoppeling** per vaardigheid.
- Scoremodel 1–10 per vaardigheid per leerling: per-les historie + rollup "laatste score".
- RLS, audit, server-side RPC's. Idempotent.
- **Klaar als:** taxonomie + scores opslagbaar, migratie schoon, RLS getest.

### Fase L1 — Examenrijpheid-engine ✅ (datalaag + engine)
- Berekening per leerling: gemiddelde, kritieke-skill-check (≥8), stabiliteit laatste 3
  lessen, koppeling theorie/machtiging/gezondheidsverklaring → advies (niet / bijna /
  examenwaardig) + Readiness Score 0–100% met fase-band. Puur adviserend.
- **Klaar als:** readiness reproduceerbaar berekend en getoond, met duidelijke disclaimer.
- **Status:** Pure engine `@workspace/leskaart` (`computeReadiness`) + server-loader
  `lib/skills/readiness-data.ts` + preconditie-store `student_cbr_status` (migratie 0031,
  RLS + service-role RPC `set_student_cbr_status` + audit). Getest:
  `db:test-readiness` (engine-asserties + RLS/RPC). Visuele weergave volgt in L2/L3.
  - Gedocumenteerde keuzes (canon laat ze open): ongescoorde leaf telt als 1
    ("nog nooit behandeld"); gemiddelde over álle actieve leaves; Readiness% =
    (gem−1)/9·100 (alles 1 = 0%, alles 10 = 100%); stabiliteit = ≥3 lessen met
    scores, spread laatste-3 ≤ 1,0 én minimum ≥ 7,0; de zone tussen "niet" en
    "bijna" (kritiek 7–7,9 of gem 7–7,49) valt conservatief op "niet examenrijp".

### Fase L2 — Instructeur-leskaart (tablet-first) ✅ (kern)
- Lescockpit uitbreiden: per categorie inklapbare secties, snelle 1–10 invoer
  (touch-stepper/slider), huidige score als carry-over, kritieke skills gemarkeerd,
  "vandaag geoefend"-chips, examenadvies-update.
- Volledige lesregistratie (voertuig, locatie, behandelde onderdelen, scores, notities,
  aandachtspunten, theoriehuiswerk).
- Enterprise visuele upgrade (dicht, snel, rustig).
- **Klaar als:** instructeur beoordeelt vlot per vaardigheid en legt de les compleet vast.
- **Status:** Instructeur-lespagina toont nu de nieuwe L0/L1-leskaart i.p.v. de platte
  CBR-checklist. Volledige taxonomie (hoofdcategorie → subcategorie → vaardigheid) in
  inklapbare secties met segmented 1–10 invoer, carry-over (`student_skill_scores`),
  kritiekmarkering, theoriekoppeling-indicator, live per-categorie ⌀/voortgang en
  "vandaag geoefend"-overzicht (`lesson_skill_scores` voor déze les). Scoren via
  server action `setSkillScoreAction` → vergrendelde RPC `set_skill_score` (audit +
  rollup). Examenrijpheid-paneel toont de L1-uitkomst (readiness%, fase, advies,
  blockers, disclaimer) en laat de instructeur de randvoorwaarden (theorie /
  machtiging / gezondheidsverklaring) bijwerken via `setStudentCbrStatusAction` →
  RPC `set_student_cbr_status`. Loader: `lib/skills/leskaart-data.ts`. Componenten:
  `components/skills/SkillScoring.tsx` + `ExamReadinessPanel.tsx`.
  - **Nog open (verschoven naar L4):** lesregistratie-context (voertuig, locatie,
    behandelde onderdelen, theoriehuiswerk) — buiten scope van L2.

### Fase L3 — Leerling- & ouder-leskaart (mobile-first)
- Per-categorie voortgang (%), examenrijpheidsmeter + fase-band, "vandaag geoefend",
  feedback per les, trend/historie, theoriehuiswerk, motiverende status.
- Ouder: read-only, uitsluitend eigen kind.
- **Klaar als:** leerling/ouder zien helder hun stand en ontwikkeling over tijd.

### Fase L4 — Lesregistratie-context & theorie
- Voertuigen & locaties beheren; behandelde onderdelen per les; theoriemodules koppelen
  aan vaardigheden; theoriehuiswerk toewijzen en volgen.
- **Klaar als:** elke les volledig contextueel vastgelegd; theorie ↔ praktijk gekoppeld.

### Fase L5 — Rapportage & kwaliteitscontrole (tenant)
- Voortgang per instructeur/leerling, examenrijpheid-overzicht, slagingsindicatoren,
  kwaliteitsbewaking binnen de rijschool.
- **Klaar als:** rijschool stuurt op kwaliteit met betrouwbare cijfers.

### Fase L6 — AI-analyse (na stabiele fundering)
- AI-lesverslag (korte notities → samenvatting), zwakke onderdelen, slagingskans,
  planningssuggesties — bovenop de gestructureerde scoredata.
- **Klaar als:** AI levert advies dat de instructeur kan overnemen of negeren.

### Doorlopend — Visuele/enterprise upgrade beide PWA's
- Tablet-first instructeur + mobile-first leerling naar enterprise design-niveau,
  consistent met het bestaande design system (Tailwind v4 tokens, dark mode,
  white-label brand-provider).

---

## Architectuurregels (gelden voor alle L-fasen)
- Multi-tenant: `tenant_id` + RLS + indexes op elke nieuwe tabel.
- Score- en dossiermutaties uitsluitend server-side via vergrendelde RPC's + audit.
- Geen specifieke rijschool hardcoden; alleen `demo-academy` in seed.
- Readiness is adviserend; instructeur blijft eindverantwoordelijk.
- Bouw per fase; start een latere fase pas als de vorige stabiel en getest is.
