# Sprint 10 - App Polish

Sprint 10 brengt de leerling-app, instructeur-app en dashboards onder een
duidelijke productlaag.

## Doel

- leerling-app voelt als een mobile-first portrait product
- instructeur-app voelt als een tablet-first landscape cockpit
- app-selectie gebeurt niet handmatig; routing kiest de juiste omgeving
- teksten, kaarten en secties blijven overal binnen dezelfde layoutregels

## Wat is aangescherpt

- gedeelde PWA primitives voor hero, pagina, KPI-tiles en kaarten
- leerling-shell met smallere portrait-canvas en compactere floating chrome
- instructeur-shell met bredere landscape-canvas en rustige agenda-rail
- managementdashboard met dezelfde producttaal, hero-opbouw en ambient shell
- primaire app-guards op student- en instructor-layout
- kernschermen en detailflows opnieuw uitgelijnd rond dezelfde spacing- en cardtaal

## Productcanon

- `/student` is de primaire app voor leerlingen
- `/instructor` is de primaire app voor instructeurs
- gecombineerde rollen krijgen geen handmatige app-keuze, maar worden op basis
  van rolprioriteit gerouteerd
- backoffice blijft de primaire omgeving voor staff-rollen boven instructeur

## Schaalbaarheid

Deze sprint bouwt geen losse pixel-fixes per pagina, maar een gedeelde
app-shell. Daardoor kunnen nieuwe leerling- en instructeurschermen op dezelfde
primitives landen zonder opnieuw layoutafspraken uit te vinden.
