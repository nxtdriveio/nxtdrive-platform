# Sprint 8 - White-label Foundation

Sprint 8 bundelt de bestaande branding-, domein- en host-routingbasis tot één
consistente white-label laag voor het platform.

## Wat deze sprint toevoegt

- Gedeelde branding helpers voor merknaam, shell-titels, beschrijvingen,
  theme-color en white-label gating.
- Tenant-aware metadata in root, backoffice, leerling- en instructeurshells.
- Tenant-aware manifesten voor platform, leerling app en instructeur app.
- White-label foundation preview in instellingen, inclusief domein, app-shell
  namen en themakleur.
- Extra revalidatie na branding-updates zodat login, metadata en PWA-manifests
  direct mee verversen.

## Canon

- White-label is alleen actief wanneer `white_label_enabled = true` én de tenant
  op `elite` staat.
- Branding blijft één gedeelde laag over backoffice, leerling en instructeur;
  geen aparte codebases per organisatie.
- Host-routing blijft leidend voor publieke branding en manifests.
- Domeinen blijven het formele bronmodel voor branded hosts; tenant_branding is
  alleen voor visuele merkdata.

## Resultaat van Sprint 8

Met deze sprint heeft NXTDRIVE nu een echt white-label fundament:
- merknaam en beschrijving lopen door in metadata
- PWA manifests zijn tenant-aware
- shell-branding is gedeeld tussen surfaces
- instellingen tonen de white-label laag als één samenhangend systeem

Latere sprints kunnen hier bovenop verder met uitgebreidere assets, branded
icons, meer domeinregels en diepere productpolish zonder de fundering opnieuw
te moeten ontwerpen.
