-- ============================================================================
-- 0032_lesson_context.sql
--
-- Leskaart L4 (deel 1) — Lescontext datalaag.
--
-- Canon: een lesregistratie is pas compleet als de instructeur naast de
-- vaardigheidsscores (L2) ook de context vastlegt: welk voertuig, welke
-- locatie, welke onderdelen behandeld zijn, een notitie voor de leerling,
-- een interne notitie (NIET zichtbaar voor de leerling) en aandachtspunten.
--
-- Tabellen:
--   * vehicles        — tenant-scoped voertuigcatalogus (beheerbaar)
--   * locations       — tenant-scoped locatiecatalogus (beheerbaar)
--   * lessons (+cols) — vehicle_id, location_id, student_note, attention_points
--                       (zichtbaar voor de leerling via de bestaande
--                        lessons-RLS: leerling ziet eigen lesrijen, 0018)
--   * lesson_internal — 1:1 interne notitie, staff-only RLS zodat de interne
--                       notitie NOOIT via een directe lesrij naar de leerling
--                       lekt.
--   * lesson_topics   — behandelde onderdelen = gekoppelde vaardigheden per les
--                       (zichtbaar voor leerling/ouder, mirror lesson_skill_scores)
--
-- Schrijven gaat uitsluitend via SECURITY DEFINER RPC's (service role):
--   * upsert_vehicle / set_vehicle_active
--   * upsert_location / set_location_active
--   * set_lesson_context  — legt alle contextvelden in één transactie vast.
-- Alle mutaties auditen in public.audit_log.
-- ============================================================================

-- 1. vehicles ----------------------------------------------------------------
create table if not exists public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  label         text not null,
  license_plate text,
  transmission  text,                          -- 'schakel' | 'automaat' | null
  active        boolean not null default true,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (char_length(label) between 1 and 120),
  check (license_plate is null or char_length(license_plate) between 1 and 16),
  check (transmission is null or transmission in ('schakel', 'automaat'))
);

alter table public.vehicles
  drop constraint if exists vehicles_id_tenant_unique;
alter table public.vehicles
  add constraint vehicles_id_tenant_unique unique (id, tenant_id);

create index if not exists idx_vehicles_tenant_active
  on public.vehicles (tenant_id, active, sort_order, label);

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;
drop policy if exists vehicles_select_members on public.vehicles;
create policy vehicles_select_members on public.vehicles
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
-- no insert/update/delete policies — writes go through RPCs (service role)

-- 2. locations ---------------------------------------------------------------
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  address     text,
  active      boolean not null default true,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(name) between 1 and 160),
  check (address is null or char_length(address) between 1 and 300)
);

alter table public.locations
  drop constraint if exists locations_id_tenant_unique;
alter table public.locations
  add constraint locations_id_tenant_unique unique (id, tenant_id);

create index if not exists idx_locations_tenant_active
  on public.locations (tenant_id, active, sort_order, name);

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

alter table public.locations enable row level security;
drop policy if exists locations_select_members on public.locations;
create policy locations_select_members on public.locations
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

-- 3. lessons context columns -------------------------------------------------
-- All four are safe to expose to the student (they read their own lesson rows
-- via 0018). The INTERNAL note lives in lesson_internal, never here.
alter table public.lessons
  add column if not exists vehicle_id       uuid references public.vehicles(id) on delete set null,
  add column if not exists location_id      uuid references public.locations(id) on delete set null,
  add column if not exists student_note     text,
  add column if not exists attention_points text;

-- 4. lesson_internal (staff-only interne notitie) ----------------------------
create table if not exists public.lesson_internal (
  lesson_id     uuid primary key references public.lessons(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  internal_note text,
  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  check (internal_note is null or char_length(internal_note) <= 4000)
);

create index if not exists idx_lesson_internal_tenant
  on public.lesson_internal (tenant_id);

drop trigger if exists lesson_internal_set_updated_at on public.lesson_internal;
create trigger lesson_internal_set_updated_at
  before update on public.lesson_internal
  for each row execute function public.set_updated_at();

alter table public.lesson_internal enable row level security;
drop policy if exists lesson_internal_select_staff on public.lesson_internal;
create policy lesson_internal_select_staff on public.lesson_internal
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = lesson_internal.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  );
-- explicitly NO student/guardian branch — interne notitie blijft staff-only.

-- 5. lesson_topics (behandelde onderdelen = gekoppelde vaardigheden) ---------
create table if not exists public.lesson_topics (
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  student_id  uuid not null,
  skill_id    uuid not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (lesson_id, skill_id),
  constraint lesson_topics_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id) on delete cascade,
  constraint lesson_topics_skill_tenant_fkey
    foreign key (skill_id, tenant_id)
    references public.skill_taxonomy (id, tenant_id) on delete cascade
);

create index if not exists idx_lesson_topics_student
  on public.lesson_topics (student_id, skill_id);
create index if not exists idx_lesson_topics_tenant
  on public.lesson_topics (tenant_id);

alter table public.lesson_topics enable row level security;
drop policy if exists lesson_topics_select_members on public.lesson_topics;
create policy lesson_topics_select_members on public.lesson_topics
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = lesson_topics.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id from public.students s
       where s.user_id = auth.uid() and s.tenant_id = lesson_topics.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id = auth.uid() and g.tenant_id = lesson_topics.tenant_id
    )
  );

-- 6. _tenant_admin_authorized helper -----------------------------------------
-- Catalog mutations (vehicles/locations) are tenant_admin (or platform admin)
-- only; instructors record context but do not manage the catalogs.
create or replace function public._tenant_admin_authorized(
  p_actor uuid, p_tenant_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'tenant_admin'
  ) or exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  );
$$;
revoke all on function public._tenant_admin_authorized(uuid, uuid) from public;
grant execute on function public._tenant_admin_authorized(uuid, uuid) to service_role;

-- 7. upsert_vehicle ----------------------------------------------------------
create or replace function public.upsert_vehicle(
  p_tenant_id     uuid,
  p_actor         uuid,
  p_id            uuid,
  p_label         text,
  p_license_plate text,
  p_transmission  text,
  p_active        boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id            uuid;
  v_label         text;
  v_plate         text;
  v_transmission  text;
  v_active        boolean := coalesce(p_active, true);
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage vehicles in tenant %', p_actor, p_tenant_id;
  end if;

  v_label := nullif(trim(coalesce(p_label, '')), '');
  if v_label is null then
    raise exception 'vehicle label cannot be empty';
  end if;
  v_plate := nullif(trim(coalesce(p_license_plate, '')), '');
  v_transmission := nullif(trim(coalesce(p_transmission, '')), '');
  if v_transmission is not null and v_transmission not in ('schakel', 'automaat') then
    raise exception 'invalid transmission %', v_transmission;
  end if;

  if p_id is null then
    insert into public.vehicles (tenant_id, label, license_plate, transmission, active)
    values (p_tenant_id, v_label, v_plate, v_transmission, v_active)
    returning id into v_id;
  else
    update public.vehicles
       set label = v_label,
           license_plate = v_plate,
           transmission = v_transmission,
           active = v_active
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
    if v_id is null then
      raise exception 'vehicle % not found in tenant %', p_id, p_tenant_id;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'vehicle.upserted', 'vehicle', v_id::text,
    jsonb_build_object('created', p_id is null, 'active', v_active)
  );

  return v_id;
end;
$$;
revoke all on function public.upsert_vehicle(uuid, uuid, uuid, text, text, text, boolean) from public;
grant execute on function public.upsert_vehicle(uuid, uuid, uuid, text, text, text, boolean) to service_role;

-- 8. set_vehicle_active ------------------------------------------------------
create or replace function public.set_vehicle_active(
  p_tenant_id uuid,
  p_actor     uuid,
  p_id        uuid,
  p_active    boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found uuid;
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage vehicles in tenant %', p_actor, p_tenant_id;
  end if;

  update public.vehicles
     set active = coalesce(p_active, true)
   where id = p_id and tenant_id = p_tenant_id
  returning id into v_found;
  if v_found is null then
    raise exception 'vehicle % not found in tenant %', p_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case when coalesce(p_active, true) then 'vehicle.activated' else 'vehicle.archived' end,
    'vehicle', p_id::text, '{}'::jsonb
  );
end;
$$;
revoke all on function public.set_vehicle_active(uuid, uuid, uuid, boolean) from public;
grant execute on function public.set_vehicle_active(uuid, uuid, uuid, boolean) to service_role;

-- 9. upsert_location ---------------------------------------------------------
create or replace function public.upsert_location(
  p_tenant_id uuid,
  p_actor     uuid,
  p_id        uuid,
  p_name      text,
  p_address   text,
  p_active    boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_name    text;
  v_address text;
  v_active  boolean := coalesce(p_active, true);
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage locations in tenant %', p_actor, p_tenant_id;
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'location name cannot be empty';
  end if;
  v_address := nullif(trim(coalesce(p_address, '')), '');

  if p_id is null then
    insert into public.locations (tenant_id, name, address, active)
    values (p_tenant_id, v_name, v_address, v_active)
    returning id into v_id;
  else
    update public.locations
       set name = v_name,
           address = v_address,
           active = v_active
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
    if v_id is null then
      raise exception 'location % not found in tenant %', p_id, p_tenant_id;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'location.upserted', 'location', v_id::text,
    jsonb_build_object('created', p_id is null, 'active', v_active)
  );

  return v_id;
end;
$$;
revoke all on function public.upsert_location(uuid, uuid, uuid, text, text, boolean) from public;
grant execute on function public.upsert_location(uuid, uuid, uuid, text, text, boolean) to service_role;

-- 10. set_location_active ----------------------------------------------------
create or replace function public.set_location_active(
  p_tenant_id uuid,
  p_actor     uuid,
  p_id        uuid,
  p_active    boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found uuid;
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage locations in tenant %', p_actor, p_tenant_id;
  end if;

  update public.locations
     set active = coalesce(p_active, true)
   where id = p_id and tenant_id = p_tenant_id
  returning id into v_found;
  if v_found is null then
    raise exception 'location % not found in tenant %', p_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case when coalesce(p_active, true) then 'location.activated' else 'location.archived' end,
    'location', p_id::text, '{}'::jsonb
  );
end;
$$;
revoke all on function public.set_location_active(uuid, uuid, uuid, boolean) from public;
grant execute on function public.set_location_active(uuid, uuid, uuid, boolean) to service_role;

-- 11. set_lesson_context -----------------------------------------------------
-- Records the full lesson context in one transaction:
--   voertuig, locatie, leerlingnotitie, interne notitie, aandachtspunten en
--   de behandelde onderdelen (gekoppelde vaardigheden). Idempotent: replaces
--   the previous topic set and overwrites the note fields.
create or replace function public.set_lesson_context(
  p_lesson_id        uuid,
  p_tenant_id        uuid,
  p_actor            uuid,
  p_vehicle_id       uuid,
  p_location_id      uuid,
  p_student_note     text,
  p_internal_note    text,
  p_attention_points text,
  p_topic_skill_ids  uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student    text;
  v_internal   text;
  v_attention  text;
  v_skill      uuid;
  v_level      smallint;
  v_active     boolean;
  v_topic_count integer := 0;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select student_id into v_student_id
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_student_id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  -- Validate vehicle/location belong to the tenant when provided.
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
     where v.id = p_vehicle_id and v.tenant_id = p_tenant_id
  ) then
    raise exception 'vehicle % not found in tenant %', p_vehicle_id, p_tenant_id;
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l
     where l.id = p_location_id and l.tenant_id = p_tenant_id
  ) then
    raise exception 'location % not found in tenant %', p_location_id, p_tenant_id;
  end if;

  v_student   := nullif(trim(coalesce(p_student_note, '')), '');
  v_internal  := nullif(trim(coalesce(p_internal_note, '')), '');
  v_attention := nullif(trim(coalesce(p_attention_points, '')), '');
  if v_student is not null and char_length(v_student) > 4000 then
    raise exception 'student note too long (max 4000)';
  end if;
  if v_internal is not null and char_length(v_internal) > 4000 then
    raise exception 'internal note too long (max 4000)';
  end if;
  if v_attention is not null and char_length(v_attention) > 4000 then
    raise exception 'attention points too long (max 4000)';
  end if;

  update public.lessons
     set vehicle_id       = p_vehicle_id,
         location_id      = p_location_id,
         student_note     = v_student,
         attention_points = v_attention
   where id = p_lesson_id and tenant_id = p_tenant_id;

  -- Interne notitie: upsert of verwijder als leeg.
  if v_internal is null then
    delete from public.lesson_internal where lesson_id = p_lesson_id;
  else
    insert into public.lesson_internal (lesson_id, tenant_id, internal_note, updated_by)
    values (p_lesson_id, p_tenant_id, v_internal, p_actor)
    on conflict (lesson_id) do update
      set internal_note = excluded.internal_note,
          updated_by    = excluded.updated_by;
  end if;

  -- Behandelde onderdelen: vervang de volledige set.
  delete from public.lesson_topics where lesson_id = p_lesson_id;
  if p_topic_skill_ids is not null then
    foreach v_skill in array p_topic_skill_ids loop
      select level, active into v_level, v_active
        from public.skill_taxonomy
       where id = v_skill and tenant_id = p_tenant_id;
      if v_level is null then
        raise exception 'skill % not found in tenant %', v_skill, p_tenant_id;
      end if;
      if v_level <> 3 then
        raise exception 'skill % is not a gradable leaf (level=%)', v_skill, v_level;
      end if;
      if v_active is not true then
        raise exception 'skill % is not active', v_skill;
      end if;
      insert into public.lesson_topics (lesson_id, tenant_id, student_id, skill_id, created_by)
      values (p_lesson_id, p_tenant_id, v_student_id, v_skill, p_actor)
      on conflict (lesson_id, skill_id) do nothing;
      v_topic_count := v_topic_count + 1;
    end loop;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.context_set', 'lesson', p_lesson_id::text,
    jsonb_build_object(
      'vehicle_id',  p_vehicle_id,
      'location_id', p_location_id,
      'has_student_note',  v_student is not null,
      'has_internal_note', v_internal is not null,
      'has_attention',     v_attention is not null,
      'topic_count',       v_topic_count
    )
  );
end;
$$;
revoke all on function public.set_lesson_context(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid[]) from public;
grant execute on function public.set_lesson_context(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid[]) to service_role;
