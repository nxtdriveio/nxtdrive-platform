# Sprint 6A - Manageable Role Permissions

Status: in progress

## Doel

Sprint 6A maakt het rollen- en permissiemodel tenant-beheerbaar zonder de platformcanon los te laten.

De vaste permission registry blijft de bron van waarheid voor standaardgedrag. Organisaties kunnen daarbovenop alleen expliciete allow- of deny-overrides per rol vastleggen wanneer hun operatie daar bewust van moet afwijken.

## Wat deze sprint toevoegt

- tabel `organization_role_permission_overrides`
- service-role RPC `set_organization_role_permission_overrides`
- server-side permission resolver die tenant-overrides meeneemt
- beheerpagina voor rolpermissies binnen organisatiebeheer
- sidebar- en organisatiehub-links naar permissiebeheer
- guardrail test: `pnpm --filter @workspace/scripts run test-manageable-role-permissions-foundation`

## Canon

- de standaard registry blijft leidend
- overrides zijn tenant-specifiek, niet platformbreed
- overrides werken per rol en per permissie
- beheerrechten blijven server-side afgedwongen
- branch-scope en andere scope-regels blijven apart bestaan naast permissies

## Buiten scope voor 6A

Nog niet in deze sprint:

- custom rollen
- per-gebruiker overrides
- UI voor scope-overrides naast permissies
- audit dashboard voor wijzigingshistorie
- franchise-specifieke geavanceerde delegatiemodellen

## Waarom deze volgorde

Eerst moet NXTDRIVE veilige tenant-overrides kunnen opslaan en afdwingen. Daarna kunnen we in latere Sprint 6-slices beheer rond rollen, scopes en mogelijk custom roltemplates verder uitbouwen zonder opnieuw aan de kern te moeten sleutelen.

# Sprint 6B - Membership Access Management

## Doel

Sprint 6B brengt de rollen- en permissiefundering naar het niveau van individuele medewerkers. Niet alleen de rol zelf, maar ook branch-scope, teams en effectieve toegang moeten nu als één beheerflow zichtbaar en bestuurbaar zijn.

## Wat deze sprint toevoegt

- medewerkersbeheer en branch-mutaties draaien nu op `requireOrganizationPermission("user:manage")` of `requireOrganizationPermission("branch:manage")`
- nieuwe pagina `/backoffice/medewerkers/[membershipId]/toegang`
- toegangsoverzicht toont rol, vestigingsscope, teamindeling en effectieve permissies per medewerker
- teams- en vestigingenschermen linken terug naar het toegangsoverzicht
- guardrail test: `pnpm --filter @workspace/scripts run test-membership-access-management-foundation`

## Canon voor 6B

- rollen blijven leidend voor basisrechten
- branch-scope bepaalt waar branch-gebonden rechten mogen gelden
- teams blijven operationeel en geven niet zelfstandig nieuwe rechten
- tenant-overrides op rolbasis blijven centraal zichtbaar via permissiebeheer

## Buiten scope voor 6B

Nog niet in deze sprint:

- per-gebruiker permission overrides
- approval flows voor access changes
- audit timeline per medewerker
- delegatie door branch managers buiten de tenant admin-flow

# Sprint 6C - Role Governance

## Doel

Sprint 6C maakt de rolcanon zelf zichtbaar en bestuurbaar in de beheerervaring. Een admin moet nu vooraf kunnen zien wat een rol betekent, wanneer die branch-scoped hoort te zijn en hoe die zich verhoudt tot permissie-overrides.

## Wat deze sprint toevoegt

- centrale rolmetadata voor label, scopebeleid, use-case en governance-notes
- nieuwe pagina `/backoffice/organisatie/rollen`
- rolgovernance-sectie in medewerkersbeheer
- uitnodigformulier met live roluitleg en scope-uitleg
- sidebar- en organisatiehub-links naar de rollenpagina
- guardrail test: `pnpm --filter @workspace/scripts run test-role-governance-foundation`

## Canon voor 6C

- kies eerst de juiste basisrol
- gebruik branch-scope om lokale rollen te begrenzen
- gebruik tenant-overrides alleen voor echte uitzonderingen
- teams blijven ondersteunend en vervangen de rolcanon niet

## Buiten scope voor 6C

Nog niet in deze sprint:

- custom rollen aanmaken via UI
- workflow approvals voor rolwijzigingen
- auditlog-weergave per rol of medewerker
- automatische aanbevelingen voor rolkeuze via AI

# Sprint 6D - Access Governance Polish

## Doel

Sprint 6D trekt de hele beheerervaring recht zodat rolcanon, scope en permissies overal op dezelfde manier uitgelegd worden. Het doel is minder losse schermen en meer één consistente access-management flow.

## Wat deze sprint toevoegt

- gedeelde governance alerts voor uitnodigen, toegangsoverzicht, vestigingen en teams
- rijkere governance-context op medewerkerstoegang en permissiebeheer
- expliciete vervolgflow tussen rollen, medewerkers, teams en permissies
- guardrail test: `pnpm --filter @workspace/scripts run test-role-governance-polish-foundation`

## Canon voor 6D

- governance komt vóór permissie-overrides
- branch-scoped rollen moeten bewust organisatiebreed gezet worden
- teams blijven operationeel en mogen de rechtenstructuur niet maskeren
- dezelfde taal en waarschuwingen moeten overal terugkomen in de admin UX

## Buiten scope voor 6D

Nog niet in deze sprint:

- custom rollen via UI
- approval workflow voor rolwijzigingen
- audit history per toegangswijziging
- per-gebruiker exception policies buiten de rolcanon
