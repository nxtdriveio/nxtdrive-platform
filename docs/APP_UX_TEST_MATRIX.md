# App UX-testmatrix

Deze matrix is de vaste releasegrens voor de leerling- en instructeursapp. Een
regel slaagt pas wanneer inhoud, navigatie en alle zichtbare acties zonder
horizontale overflow, afkapping of onbereikbare bediening werken.

| Viewport  | Gebruik                                 | Verplichte instructeursroutes                                    | Verplichte leerlingroutes                  |
| --------- | --------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| 390×844   | Kleine telefoon, portrait               | Cockpit, Agenda lijst/detail, Leerlingen lijst/detail, Account   | Home, Lessen, Voortgang/Reflectie, Account |
| 768×1024  | Kleine tablet, portrait                 | Cockpit, Agenda, Leerlingen, Berichten                           | Home, Lessen, Voortgang, Account           |
| 1024×768  | Canonieke instructeurstablet, landscape | Cockpit, Agenda master-detail, Leerlingen master-detail, Account | Home en lesdetail                          |
| 1180×820  | Grote tablet/kleine laptop              | Cockpit, Agenda, Leerlingen, Berichten                           | Home, Lessen, Voortgang                    |
| 1440×1000 | Desktop                                 | Alle primaire routes en contextuele routes                       | Alle primaire routes en contextuele routes |

## Acceptatiecriteria

- De primaire navigatie bevat exact vijf items.
- De pagina heeft geen horizontale documentoverflow en geen zichtbaar element
  valt buiten de viewport.
- De cockpit gebruikt op 1024×768 maximaal twee kolommen.
- Agenda en Leerlingen houden op landscape-tablet lijst en geselecteerd detail
  tegelijk zichtbaar; op telefoon opent detail als vervolgstap met een
  zichtbare terugactie.
- Meldingen, Account en Uitloggen zijn op telefoon bereikbaar.
- Iedere zichtbare link heeft een concrete bestemming. Iedere zichtbare knop
  heeft een toegankelijke naam en een aantoonbare actie.
- Een queryfout toont de foutstaat; alleen een succesvolle lege query toont de
  lege staat.

De browserreleasegate voert deze matrix uit tegen deterministische fixtures.
Pixelvergelijking blijft aanvullend; functionele layout- en actietests zijn
leidend voor blokkeren van een release.
