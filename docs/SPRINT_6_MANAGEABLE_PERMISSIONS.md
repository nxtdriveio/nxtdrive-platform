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
