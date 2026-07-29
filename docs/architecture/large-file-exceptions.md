# Grote-bestandenregister

Status: gecontroleerd op 2026-07-29.

De sprint heeft nieuwe domeinlogica voor readiness, assessments, privacy,
security, offline synchronisatie, routing en tijd uit bestaande UI- en
actionbestanden gehaald. Onderstaande bestaande productiefiles blijven boven de
richtwaarde van 800 regels. Dit zijn expliciete tijdelijke uitzonderingen, geen
claim dat de architectuurrefactor compleet is.

| Bestand                                                      | Regels | Reden voor tijdelijke uitzondering                                                       | Volgende veilige grens                    |
| ------------------------------------------------------------ | -----: | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| `lib/notifications/dispatch.ts`                              |   2482 | Veel bestaande kanaal- en templatecontracten; risicovol zonder outbox-fixtures           | kanaaladapters en delivery-policy         |
| `lib/franchise/actions.ts`                                   |   2084 | Bestaande franchisecommandset met breed publiek contract                                 | commands, policies en repositories        |
| `app/backoffice/planning-board/planning-board-workspace.tsx` |   1673 | Interactieve boardstate en DnD-contract                                                  | selectors, commands en presentatiesecties |
| `lib/notifications/templates.ts`                             |   1513 | Groot bestaand templatecataloguscontract                                                 | catalogusdata los van renderers           |
| `app/admin/page.tsx`                                         |   1491 | Platformdashboard met gekoppelde queries                                                 | queryservice en dashboardsecties          |
| `lib/ris/data.ts`                                            |   1443 | Compatibiliteitsprojectie voor bestaande RIS-UI                                          | adapters per trainingsmethode             |
| `components/instructor/RedesignViews.tsx`                    |   1337 | Gedeelde, gekarakteriseerde instructeursviews; kernlogica is al naar services verplaatst | één viewmodule per canonieke route        |
| `app/backoffice/leads/actions.ts`                            |   1325 | Bestaande leadcommands en externe meldingen                                              | leadcommandhandlers                       |
| `app/backoffice/instellingen/actions.ts`                     |   1306 | Meerdere bestaande configuratiedomeinen                                                  | settingsservices per domein               |
| `components/student/StudentPwa.tsx`                          |   1295 | Oud samengestelde leerlingpresentatie                                                    | homepage, examens en betalingen           |
| `app/backoffice/voertuigen/page.tsx`                         |   1266 | Bestaande voertuigworkspace                                                              | querylaag en formuliersecties             |
| `app/backoffice/leads/[id]/page.tsx`                         |   1227 | Bestaand leaddossier                                                                     | dossiersecties                            |
| `lib/lesson-planning/candidates.ts`                          |   1193 | Planningregels met bestaand contract                                                     | harde blockers, scoring en uitleg         |
| `lib/ris/actions.ts`                                         |   1073 | Compatibiliteitsactions; nieuwe readinessbeslissingen staan al centraal                  | legacy adapters en commandhandlers        |
| `lib/instructors/backoffice.ts`                              |   1023 | Bestaande backofficequerybundel                                                          | queries per use-case                      |
| `app/backoffice/franchise/aandacht/page.tsx`                 |   1017 | Bestaande exceptionworkspace                                                             | query/presenter-scheiding                 |
| `app/admin/tenants/[id]/page.tsx`                            |   1008 | Bestaand tenantdossier                                                                   | secties en queryservice                   |
| `app/backoffice/instructeurs/[instructorId]/page.tsx`        |    992 | Bestaand instructeursdossier                                                             | secties en queryservice                   |
| `app/backoffice/facturen/[id]/page.tsx`                      |    939 | Bestaand factuurdossier                                                                  | betalings-, status- en presentatielaag    |
| `app/intake/[slug]/intake-wizard.tsx`                        |    907 | Stateful publieke wizard                                                                 | stapcontrollers en schema’s               |
| `app/backoffice/leerlingen/actions.ts`                       |    886 | Bestaande commands plus nieuwe veilige upload/profileflow                                | document- en profielhandlers              |
| `lib/trial-lessons/suggestions.ts`                           |    872 | Bestaande voorstelregels                                                                 | eligibility, scoring en uitleg            |
| `components/ris/RisLessonPublicationPanel.tsx`               |    848 | Kritieke publicatieflow met nieuwe guards; eerst browserfixtures uitbreiden              | guardpresentatie en formulieren           |
| `components/instructor/AgendaWorkspace.tsx`                  |    818 | Bestaande agenda-interactie                                                              | queries, commands en detailpaneel         |
| `app/backoffice/organisatie/permissies/page.tsx`             |    808 | Bestaande permissiematrix                                                                | policyquery en matrixpresentatie          |

Eigenaar voor opvolging: engineering lead. Trigger: vóór functionele uitbreiding
van het betreffende bestand. Iedere splitsing vereist eerst karakterisatie- en
integratietests; alleen regels verplaatsen om een teller te halen is niet
toegestaan.
