-- Tenant product operations center:
-- support tickets, production checklists, release management and roadmap
-- interest polling. All public-schema tables get RLS immediately.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  franchise_tenant_id uuid references public.tenants(id) on delete set null,
  title text not null check (char_length(trim(title)) between 4 and 160),
  description text not null default '',
  category text not null default 'question'
    check (category in ('question', 'bug', 'billing', 'feature', 'data', 'onboarding')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'triage', 'waiting_on_tenant', 'waiting_on_nxtdrive', 'resolved', 'closed')),
  source text not null default 'tenant_dashboard'
    check (source in ('tenant_dashboard', 'franchise_dashboard', 'system', 'platform_admin')),
  requester_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  last_response_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table if not exists public.support_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  visibility text not null default 'tenant'
    check (visibility in ('tenant', 'internal')),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.production_checklists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  checklist_type text not null
    check (checklist_type in ('onboarding', 'monitoring', 'go_live')),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists production_checklists_set_updated_at on public.production_checklists;
create trigger production_checklists_set_updated_at
  before update on public.production_checklists
  for each row execute function public.set_updated_at();

create table if not exists public.production_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.production_checklists(id) on delete cascade,
  slug text not null,
  title text not null,
  description text not null default '',
  owner_role text not null default 'tenant_admin',
  evidence_hint text,
  sort_order integer not null default 100,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checklist_id, slug)
);

drop trigger if exists production_checklist_items_set_updated_at on public.production_checklist_items;
create trigger production_checklist_items_set_updated_at
  before update on public.production_checklist_items
  for each row execute function public.set_updated_at();

create table if not exists public.tenant_checklist_item_statuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checklist_item_id uuid not null references public.production_checklist_items(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'done', 'blocked', 'not_applicable')),
  note text,
  evidence_url text,
  updated_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, checklist_item_id)
);

drop trigger if exists tenant_checklist_item_statuses_set_updated_at on public.tenant_checklist_item_statuses;
create trigger tenant_checklist_item_statuses_set_updated_at
  before update on public.tenant_checklist_item_statuses
  for each row execute function public.set_updated_at();

create table if not exists public.product_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  summary text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'staging', 'production', 'archived')),
  audience text not null default 'all'
    check (audience in ('all', 'start', 'pro', 'elite', 'franchise')),
  staging_merged_at timestamptz,
  production_released_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists product_releases_set_updated_at on public.product_releases;
create trigger product_releases_set_updated_at
  before update on public.product_releases
  for each row execute function public.set_updated_at();

create table if not exists public.product_release_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.product_releases(id) on delete cascade,
  item_type text not null default 'feature'
    check (item_type in ('feature', 'improvement', 'fix', 'security', 'known_issue')),
  title text not null,
  description text not null default '',
  surface text not null default 'platform',
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_release_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  release_id uuid not null references public.product_releases(id) on delete cascade,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz not null default now(),
  unique (tenant_id, release_id)
);

create table if not exists public.product_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'ideas'
    check (category in ('now', 'next', 'later', 'ideas', 'launched', 'not_planned')),
  status text not null default 'idea'
    check (status in ('idea', 'research', 'design', 'development', 'beta', 'released', 'not_planned')),
  surface text not null default 'platform',
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  target_period text,
  is_public boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  moved_by uuid references auth.users(id) on delete set null,
  moved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists product_roadmap_items_set_updated_at on public.product_roadmap_items;
create trigger product_roadmap_items_set_updated_at
  before update on public.product_roadmap_items
  for each row execute function public.set_updated_at();

create table if not exists public.product_roadmap_interest (
  id uuid primary key default gen_random_uuid(),
  roadmap_item_id uuid not null references public.product_roadmap_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  interest_level text not null default 'interested'
    check (interest_level in ('interested', 'important', 'critical')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roadmap_item_id, tenant_id)
);

drop trigger if exists product_roadmap_interest_set_updated_at on public.product_roadmap_interest;
create trigger product_roadmap_interest_set_updated_at
  before update on public.product_roadmap_interest
  for each row execute function public.set_updated_at();

create index if not exists idx_support_tickets_tenant_status
  on public.support_tickets (tenant_id, status, priority);
create index if not exists idx_support_ticket_comments_ticket
  on public.support_ticket_comments (ticket_id, created_at);
create index if not exists idx_tenant_checklist_status_tenant
  on public.tenant_checklist_item_statuses (tenant_id, status);
create index if not exists idx_product_releases_status
  on public.product_releases (status, production_released_at desc);
create index if not exists idx_product_roadmap_items_public_category
  on public.product_roadmap_items (is_public, category, priority);
create index if not exists idx_product_roadmap_interest_tenant
  on public.product_roadmap_interest (tenant_id, interest_level);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_comments enable row level security;
alter table public.production_checklists enable row level security;
alter table public.production_checklist_items enable row level security;
alter table public.tenant_checklist_item_statuses enable row level security;
alter table public.product_releases enable row level security;
alter table public.product_release_items enable row level security;
alter table public.tenant_release_acknowledgements enable row level security;
alter table public.product_roadmap_items enable row level security;
alter table public.product_roadmap_interest enable row level security;

drop policy if exists support_tickets_select_members on public.support_tickets;
create policy support_tickets_select_members on public.support_tickets
  for select to authenticated
  using (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists support_tickets_insert_members on public.support_tickets;
create policy support_tickets_insert_members on public.support_tickets
  for insert to authenticated
  with check (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists support_tickets_update_admins on public.support_tickets;
create policy support_tickets_update_admins on public.support_tickets
  for update to authenticated
  using (
    public.has_role(tenant_id, 'tenant_admin')
    or public.has_role(tenant_id, 'franchise_admin')
    or public.is_platform_admin()
  )
  with check (
    public.has_role(tenant_id, 'tenant_admin')
    or public.has_role(tenant_id, 'franchise_admin')
    or public.is_platform_admin()
  );

drop policy if exists support_ticket_comments_select_members on public.support_ticket_comments;
create policy support_ticket_comments_select_members on public.support_ticket_comments
  for select to authenticated
  using (
    (tenant_id in (select public.my_tenant_ids()) and visibility = 'tenant')
    or public.is_platform_admin()
  );

drop policy if exists support_ticket_comments_insert_members on public.support_ticket_comments;
create policy support_ticket_comments_insert_members on public.support_ticket_comments
  for insert to authenticated
  with check (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists production_checklists_select_members on public.production_checklists;
create policy production_checklists_select_members on public.production_checklists
  for select to authenticated
  using (is_active or public.is_platform_admin());

drop policy if exists production_checklists_platform_write on public.production_checklists;
create policy production_checklists_platform_write on public.production_checklists
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists production_checklist_items_select_members on public.production_checklist_items;
create policy production_checklist_items_select_members on public.production_checklist_items
  for select to authenticated
  using (
    exists (
      select 1 from public.production_checklists c
      where c.id = checklist_id and c.is_active
    )
    or public.is_platform_admin()
  );

drop policy if exists production_checklist_items_platform_write on public.production_checklist_items;
create policy production_checklist_items_platform_write on public.production_checklist_items
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists tenant_checklist_status_select_members on public.tenant_checklist_item_statuses;
create policy tenant_checklist_status_select_members on public.tenant_checklist_item_statuses
  for select to authenticated
  using (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists tenant_checklist_status_write_admins on public.tenant_checklist_item_statuses;
create policy tenant_checklist_status_write_admins on public.tenant_checklist_item_statuses
  for all to authenticated
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());

drop policy if exists product_releases_select_members on public.product_releases;
create policy product_releases_select_members on public.product_releases
  for select to authenticated
  using (status in ('staging', 'production') or public.is_platform_admin());

drop policy if exists product_releases_platform_write on public.product_releases;
create policy product_releases_platform_write on public.product_releases
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists product_release_items_select_members on public.product_release_items;
create policy product_release_items_select_members on public.product_release_items
  for select to authenticated
  using (
    exists (
      select 1 from public.product_releases r
      where r.id = release_id and r.status in ('staging', 'production')
    )
    or public.is_platform_admin()
  );

drop policy if exists product_release_items_platform_write on public.product_release_items;
create policy product_release_items_platform_write on public.product_release_items
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists tenant_release_ack_select_members on public.tenant_release_acknowledgements;
create policy tenant_release_ack_select_members on public.tenant_release_acknowledgements
  for select to authenticated
  using (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists tenant_release_ack_write_admins on public.tenant_release_acknowledgements;
create policy tenant_release_ack_write_admins on public.tenant_release_acknowledgements
  for all to authenticated
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());

drop policy if exists product_roadmap_items_select_members on public.product_roadmap_items;
create policy product_roadmap_items_select_members on public.product_roadmap_items
  for select to authenticated
  using (is_public or public.is_platform_admin());

drop policy if exists product_roadmap_items_platform_write on public.product_roadmap_items;
create policy product_roadmap_items_platform_write on public.product_roadmap_items
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists product_roadmap_interest_select_members on public.product_roadmap_interest;
create policy product_roadmap_interest_select_members on public.product_roadmap_interest
  for select to authenticated
  using (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists product_roadmap_interest_write_members on public.product_roadmap_interest;
create policy product_roadmap_interest_write_members on public.product_roadmap_interest
  for all to authenticated
  using (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin())
  with check (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_comments to authenticated;
grant select, insert, update, delete on public.production_checklists to authenticated;
grant select, insert, update, delete on public.production_checklist_items to authenticated;
grant select, insert, update on public.tenant_checklist_item_statuses to authenticated;
grant select, insert, update, delete on public.product_releases to authenticated;
grant select, insert, update, delete on public.product_release_items to authenticated;
grant select, insert, update on public.tenant_release_acknowledgements to authenticated;
grant select, insert, update, delete on public.product_roadmap_items to authenticated;
grant select, insert, update, delete on public.product_roadmap_interest to authenticated;

insert into public.production_checklists (slug, title, description, checklist_type, sort_order)
values
  ('tenant-onboarding-foundation', 'Onboarding naar productie', 'Formele klantchecklist voor inrichting, rollen, facturatie, communicatie en livegang.', 'onboarding', 10),
  ('tenant-monitoring-foundation', 'Monitoring & continuiteit', 'Operationele checklist voor dagelijkse bewaking, alerts, supportproces en datakwaliteit.', 'monitoring', 20)
on conflict (slug) do update
set title = excluded.title,
    description = excluded.description,
    checklist_type = excluded.checklist_type,
    sort_order = excluded.sort_order;

insert into public.production_checklist_items
  (checklist_id, slug, title, description, owner_role, evidence_hint, sort_order)
select c.id, v.slug, v.title, v.description, v.owner_role, v.evidence_hint, v.sort_order
from public.production_checklists c
join (
  values
    ('tenant-onboarding-foundation', 'tenant-profile', 'Organisatieprofiel gecontroleerd', 'Naam, vestigingen, domein, contactgegevens en huisstijl zijn gecontroleerd.', 'tenant_admin', 'Controleer Instellingen en Organisatie.', 10),
    ('tenant-onboarding-foundation', 'team-access', 'Rollen en toegang afgerond', 'Alle medewerkers hebben de juiste rol, vestiging en toegang.', 'tenant_admin', 'Controleer Medewerkers, Rollen en Permissies.', 20),
    ('tenant-onboarding-foundation', 'planning-ready', 'Planning klaar voor gebruik', 'Agenda, instructeurs, voertuigen, rayons en beschikbaarheid zijn compleet.', 'planner', 'Controleer Planboard, Beschikbaarheid en Voertuigen.', 30),
    ('tenant-onboarding-foundation', 'financial-ready', 'Facturatie en pakketten ingericht', 'Pakketten, tegoedbeleid, facturen en betaalinstellingen zijn gereed.', 'tenant_admin', 'Controleer Pakketten, Facturen en Boekhouding.', 40),
    ('tenant-onboarding-foundation', 'student-communication', 'Leerlingcommunicatie getest', 'Welkom, reminders, app-toegang en notificaties zijn getest.', 'admin_staff', 'Controleer Notificaties en test met een proefleerling.', 50),
    ('tenant-monitoring-foundation', 'support-flow', 'Supportproces actief', 'Supporttickets worden opgevolgd met eigenaar, prioriteit en status.', 'tenant_admin', 'Gebruik Support in de backoffice.', 10),
    ('tenant-monitoring-foundation', 'release-review', 'Releaseproces bewaakt', 'Nieuwe staging/productie releases worden gelezen en intern verwerkt.', 'tenant_admin', 'Bekijk Releasebeheer na iedere productie-update.', 20),
    ('tenant-monitoring-foundation', 'data-quality', 'Datakwaliteit bewaakt', 'Leads, leerlingen, planning, facturen en CBR/RIS status worden periodiek gecontroleerd.', 'branch_manager', 'Controleer dashboard alerts en rapportages.', 30),
    ('tenant-monitoring-foundation', 'availability-health', 'Beschikbaarheid actueel', 'Instructeur- en voertuigbeschikbaarheid is betrouwbaar en actueel.', 'planner', 'Controleer Beschikbaarheid en Planboard.', 40),
    ('tenant-monitoring-foundation', 'security-access-review', 'Toegang periodiek beoordeeld', 'Medewerkers en externe toegang worden periodiek herzien.', 'tenant_admin', 'Controleer medewerkers en audit.', 50)
) as v(checklist_slug, slug, title, description, owner_role, evidence_hint, sort_order)
  on c.slug = v.checklist_slug
on conflict (checklist_id, slug) do update
set title = excluded.title,
    description = excluded.description,
    owner_role = excluded.owner_role,
    evidence_hint = excluded.evidence_hint,
    sort_order = excluded.sort_order;

insert into public.product_releases (version, title, summary, status, audience, staging_merged_at)
values (
  '2026.06-product-ops',
  'Product operations center',
  'Nieuwe beheerlaag voor support, releasebeheer, roadmap, checklists en tenantmogelijkheden.',
  'staging',
  'all',
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    status = excluded.status,
    audience = excluded.audience,
    staging_merged_at = coalesce(public.product_releases.staging_merged_at, excluded.staging_merged_at);

insert into public.product_release_items (release_id, item_type, title, description, surface, sort_order)
select r.id, v.item_type, v.title, v.description, v.surface, v.sort_order
from public.product_releases r
join (
  values
    ('feature', 'Support tickets in beheeromgeving', 'Tenant- en franchisebeheerders kunnen vragen, bugs en verzoeken centraal opvolgen.', 'backoffice', 10),
    ('feature', 'Releasebeheer voor staging naar productie', 'Releases kunnen worden voorbereid op staging en eenvoudig naar productie worden gemarkeerd.', 'backoffice', 20),
    ('feature', 'Roadmap en ideeenbord', 'Tenants kunnen interesse tonen; platform admin kan items verplaatsen tussen categorieen.', 'backoffice', 30),
    ('improvement', 'Formele onboarding- en monitoringchecklists', 'Productiechecks zijn zichtbaar en afvinkbaar per tenant.', 'operations', 40),
    ('improvement', 'Centraal mogelijkhedenoverzicht', 'Tenant ziet per abonnementsniveau exact wat wel en niet beschikbaar is.', 'subscription', 50)
) as v(item_type, title, description, surface, sort_order)
on r.version = '2026.06-product-ops'
where not exists (
  select 1 from public.product_release_items i
  where i.release_id = r.id and i.title = v.title
);

insert into public.product_roadmap_items
  (title, description, category, status, surface, priority, target_period, is_public)
values
  ('Smart booking verdieping', 'Meer herstel, wachtrijlogica, voertuigrouting en campagneconversie rondom boekingen.', 'now', 'development', 'planning', 'high', 'Q3 2026', true),
  ('RIS rapportage en AI-samenvatting', 'Leskaartdata naar heldere leerling- en instructeurrapportages met controleerbare AI-hulp.', 'now', 'development', 'ris', 'high', 'Q3 2026', true),
  ('Franchise command center acties', 'Signaal naar eigenaar, status, audit, acknowledgement en benchmarksturing verder verfijnen.', 'next', 'design', 'franchise', 'high', 'Q3/Q4 2026', true),
  ('Marketing widget optimalisaties', 'A/B varianten, conversie-events en campagne dashboards voor intake widgets.', 'next', 'research', 'marketing', 'medium', 'Q4 2026', true),
  ('Mobiele offline leskaart', 'Nog robuustere offline-first leskaart voor instructeurs op locatie.', 'later', 'idea', 'instructor', 'medium', null, true),
  ('Tenant API webhooks', 'Configureerbare webhooks voor CRM, finance en planning events.', 'ideas', 'idea', 'platform', 'medium', null, true)
on conflict do nothing;
