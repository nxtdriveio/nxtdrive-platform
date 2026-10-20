# UI/UX — behoud het prototype, verbeter de productiekwaliteit

Referentie: [NXTDRIVE V1, versie 12](https://nxtdrive-v1-studio.dgwebserv.chatgpt.site/tutorial). Broncommit: `53472e3a18a1974532965bf06214d9db7398b514`.

## Visuele richting

Behoud de premium rustige vormgeving: ruime maar functionele pagina-indeling, heldere hiërarchie, semantische kleur, compacte statuslabels, strakke tabellen, zorgvuldige kaarten en goed leesbare typografie. NXTDRIVE gebruikt de bestaande paarse identiteit; de Van Dijk-variant gebruikt zwart/geel met het correcte licht/donkerlogo. Neem de bestaande SVG-assets en hun geometrie over, verzin geen vervangend logo.

Gebruik gedeelde tokens voor achtergrond, oppervlak, tekst, secundaire tekst, rand, accent, focus en feedback. Ondersteun light/dark zonder hardcoded tekstkleuren die in één thema onleesbaar worden. Geel op een lichte achtergrond moet aan contrast worden getoetst. Geef statussen naast kleur ook tekst of iconografie.

Motion ondersteunt oriëntatie: korte pagina-/paneeltransities, subtiele feedback en behoud van ruimtelijke samenhang. Geen animaties die een invoeractie vertragen. Respecteer `prefers-reduced-motion`. Geen eindeloze glans- of zweefeffecten in een werkdashboard.

## Shell per rol

- Rijschoolbeheer: vaste organisatienavigatie, herkenbare paginatitel, globale zoekfunctie en meldingen; hoofdhandeling per pagina duidelijk.
- Platform: zelfstandig platformoverzicht en operationele bediening; niet vermengen met de dagelijkse rijschooltaken.
- Instructeur: eigen werkdag als start, agenda, auto's en meer. Op mobiel een bereikbare onderste navigatie; op tablet benut de extra breedte zonder desktopformulieren te verkleinen.
- Leerling: eerst de volgende les en concrete volgende stap, vervolgens lessen, voortgang en meer. Geen druk administratief dashboard.
- Tutorial: herkenbare toegang bovenin elke omgeving en vanuit Ontdek V1. Centrale zoekbare inhoudsopgave, voortgang, volledige route en routes per rol.

## De 60-secondenflow

1. Open de actieve les vanuit de eigen agenda of werkdag.
2. Zie twee of drie voorbereide doelen met de vorige stand als context.
3. Tik per doel op beoordeeld, geoefend of niet behandeld; kies zo nodig de instructiestap.
4. Kies doeluitkomst. Context en opmerkingen zijn optioneel zolang een betekenisvolle basisregistratie bestaat.
5. Laat een korte samenvatting en volgende focus uit de bewuste keuzes ontstaan. Geef de instructeur controle en snelle correctie.
6. Laat in één overzicht zien wat de leerling krijgt; kies reflectiestatus en publiceer.

Houd het aantal verplichte handelingen laag. Geen verplichte lange tekstvelden per doel, geen volledige RIS-catalogus op elk lesformulier, geen ongevraagd kopiëren van oude beoordelingen. Conceptbehoud moet betrouwbaar zijn bij navigatie, onderbreking en verbindingsverlies. Beschrijf zichtbaar wat opgeslagen is en wat nog niet is verzonden.

Meet de hele normale afhandeling, inclusief openen, controleren en opslaan. Gebruik representatieve instructeurs, niet alleen de bouwer; noteer mediaan, spreiding en waar tijd verloren gaat. Een les met bijzondere omstandigheden mag meer tijd vragen zonder de normale route zwaarder te maken.

## Mobiel, tablet, modals en scrollbars

- Test minimaal smalle telefoon, grote telefoon, tablet staand/liggend en desktop; ook kort viewport, 200% zoom, browserbalken en schermtoetsenbord.
- Formulieren hebben `min-width: 0`, volledige beschikbare breedte en voldoende rechterpadding binnen scrollcontainers. Gebruik `scrollbar-gutter: stable` waar passend. Velden en selectpijlen mogen de scrollbar niet raken.
- Centreer een modal ten opzichte van de viewport, niet een toevallig getransformeerde ouder. Een zijpaneel erft nooit de `translate(-50%, -50%)` van een gecentreerde modal.
- Begrens de totale hoogte met dynamische viewporteenheden en safe areas. Laat een specifieke inhoudszone scrollen; houd titel/sluiten en hoofdactie bereikbaar.
- Een modal heeft juiste titel, beschrijving, focus trap, Escape-gedrag en focusherstel naar de trigger. Een tutorial bovenop een modal moet binnen dezelfde focusscope staan.
- De tutorial gebruikt in de demo een compacte coach in de dialog-body; buiten modals staat hij aan de onderkant/rechterkant. Hij kan worden ingeklapt en gepauzeerd. Bij navigatie krijgt de uitleg focus; zakelijke acties worden niet automatisch uitgevoerd.
- Touchtargets bij voorkeur ten minste circa 44 px voor veelgebruikte bediening. Geen hover-only functies. Drag-and-drop heeft een klik/touch- en toetsenbordalternatief.
- Voor destructieve of financiële acties: korte expliciete samenvatting van gevolg, reden waar vereist en één bewuste bevestiging. Vermijd extra bevestigingen voor gewone velden.

## Bronkaart voor implementatie

Paden zijn relatief aan de Sites-prototypebron, niet automatisch aan de oude VPS-app.

| Onderdeel | Referentie |
| --- | --- |
| Shells, rolbediening, zoekfunctie | `components/nxtdrive/shell.tsx`, `workspace.tsx` |
| Branding en logoassets | `components/nxtdrive/branding.tsx`, `public/`, `app/whitelabel.css` |
| Globale styles | `app/globals.css`, `shell.css`, `mobility.css`, `learning.css`, `completion.css` |
| Dialogpositie en focusbasis | `components/ui/dialog.tsx`, `components/nxtdrive/flows.tsx` |
| Planbord/afspraken | `components/nxtdrive/planner.tsx`, `mobility-model.ts`, `lesson-operations.tsx` |
| Locaties en reismarges | `locations.ts`, `travel.ts`, `travel-review.tsx`, `smart-scheduling.tsx` |
| Lescyclus en RIS | `lesson-cycle.tsx`, `learning-model.ts`, `ris-complete.tsx`, `ris-catalog.json` |
| Leerling-/instructeursoverzichten | `apps.tsx`, `lesson-workspace.tsx` |
| Wagenpark en kilometers | `fleet.tsx`, `mobility-model.ts` |
| Toetsen/examenbewijs | `exam-hub.tsx` |
| Geld en minuten | `finance-complete.tsx`, `completion-model.ts` |
| Intake, uitnodiging en team | `intake-complete.tsx` |
| Taken en communicatie | `operations-complete.tsx` |
| Import/privacy | `privacy-complete.tsx`, `import-model.ts` |
| Featureoverzicht | `v1.tsx` |
| Tutorial | `tutorial/catalog.json`, `tutorial/model.ts`, `tutorial/tutorial.tsx`, `app/tutorial.css` |
| Demonstratiegegevens | `store.tsx` — alleen referentie, geen productiebackend |
| Gedragsvoorbeelden | `tests/completion.test.mjs`, `learning.test.mjs`, `mobility.test.mjs`, `tutorial.test.mjs` |

Controleer de daadwerkelijke padnamen in de opgehaalde commit voordat je bestanden verplaatst. De bronkaart is bedoeld om de juiste domeinen te vinden; zij schrijft geen nieuwe mappenstructuur voor.

## Wat nog moet worden bewezen

De prototypebuild en 36 domein-/tutorialtests zijn geslaagd. De nieuwe tutorial is in deze ronde niet in een browser of op een echt mobiel apparaat visueel getest. Claims over 60 seconden, toegankelijkheidsconformiteit, productieperformance en live integraties zijn daarom acceptatiedoelen voor de echte release. Maak een nieuwe scherminventaris en test de interacties op staging vóór vrijgave.
