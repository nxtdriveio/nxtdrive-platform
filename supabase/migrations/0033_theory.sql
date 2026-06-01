-- ============================================================================
-- 0033_theory.sql
--
-- Leskaart L4 (deel 2) — Theoriekoppeling & theoriehuiswerk.
--
-- Canon: theorie en praktijk horen bij elkaar. Een rijschool koppelt
-- theoriemodules aan praktijkvaardigheden (skill_taxonomy leaves) en kan een
-- leerling theoriehuiswerk opgeven met een deadline. De leerling ziet het
-- huiswerk + status en kan het zelf op 'done' zetten.
--
-- "Theorie behaald" (cbr_status, 0031) blijft de input voor de readiness-engine
-- (L1) — die wordt hier NIET aangeraakt. Theoriehuiswerk is een losse,
-- pedagogische laag bovenop de bestaande theorie-vlag.
--
-- Tabellen:
--   * theory_modules        — tenant-scoped theoriemodulecatalogus (beheerbaar)
--   * theory_module_skills  — koppeling module <-> vaardigheid (leaf)
--   * theory_homework       — opgegeven huiswerk per leerling (+ deadline/status)
--
-- Schrijven via SECURITY DEFINER RPC's (service role), alle mutaties audited.
-- ============================================================================

-- 0. status enum -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'theory_homework_status') then
    create type public.theory_homework_status as enum ('open', 'done', 'cancelled');
  end if;
end $$;

-- 1. theory_modules ----------------------------------------------------------
create table if not exists public.theory_modules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  code        text,                          -- stabiel per tenant voor seed/koppeling; null voor handmatig
  title       text not null,
  description text,
  active      boolean not null default true,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(title) between 1 and 160),
  check (code is null or char_length(code) between 1 and 80),
  check (description is null or char_length(description) <= 2000),
  unique (tenant_id, code)
);

alter table public.theory_modules
  drop constraint if exists theory_modules_id_tenant_unique;
alter table public.theory_modules
  add constraint theory_modules_id_tenant_unique unique (id, tenant_id);

create index if not exists idx_theory_modules_tenant_active
  on public.theory_modules (tenant_id, active, sort_order, title);

drop trigger if exists theory_modules_set_updated_at on public.theory_modules;
create trigger theory_modules_set_updated_at
  before update on public.theory_modules
  for each row execute function public.set_updated_at();

alter table public.theory_modules enable row level security;
drop policy if exists theory_modules_select_members on public.theory_modules;
create policy theory_modules_select_members on public.theory_modules
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

-- 2. theory_module_skills (koppeling module <-> vaardigheid) ------------------
create table if not exists public.theory_module_skills (
  theory_module_id uuid not null,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  skill_id         uuid not null,
  created_at       timestamptz not null default now(),
  primary key (theory_module_id, skill_id),
  constraint theory_module_skills_module_tenant_fkey
    foreign key (theory_module_id, tenant_id)
    references public.theory_modules (id, tenant_id) on delete cascade,
  constraint theory_module_skills_skill_tenant_fkey
    foreign key (skill_id, tenant_id)
    references public.skill_taxonomy (id, tenant_id) on delete cascade
);

create index if not exists idx_theory_module_skills_skill
  on public.theory_module_skills (skill_id);
create index if not exists idx_theory_module_skills_tenant
  on public.theory_module_skills (tenant_id);

alter table public.theory_module_skills enable row level security;
drop policy if exists theory_module_skills_select_members on public.theory_module_skills;
create policy theory_module_skills_select_members on public.theory_module_skills
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

-- 3. theory_homework ---------------------------------------------------------
create table if not exists public.theory_homework (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  student_id       uuid not null,
  theory_module_id uuid not null,
  lesson_id        uuid references public.lessons(id) on delete set null,
  status           public.theory_homework_status not null default 'open',
  deadline         date,
  note             text,
  assigned_by      uuid references auth.users(id) on delete set null,
  completed_at     timestamptz,
  completed_by     uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (note is null or char_length(note) <= 1000),
  constraint theory_homework_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id) on delete cascade,
  constraint theory_homework_module_tenant_fkey
    foreign key (theory_module_id, tenant_id)
    references public.theory_modules (id, tenant_id) on delete cascade
);

create index if not exists idx_theory_homework_student_status
  on public.theory_homework (student_id, status);
create index if not exists idx_theory_homework_tenant_status
  on public.theory_homework (tenant_id, status, deadline);
create index if not exists idx_theory_homework_lesson
  on public.theory_homework (lesson_id);

drop trigger if exists theory_homework_set_updated_at on public.theory_homework;
create trigger theory_homework_set_updated_at
  before update on public.theory_homework
  for each row execute function public.set_updated_at();

alter table public.theory_homework enable row level security;
drop policy if exists theory_homework_select_members on public.theory_homework;
create policy theory_homework_select_members on public.theory_homework
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = theory_homework.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id from public.students s
       where s.user_id = auth.uid() and s.tenant_id = theory_homework.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id = auth.uid() and g.tenant_id = theory_homework.tenant_id
    )
  );

-- 4. upsert_theory_module (tenant_admin) -------------------------------------
create or replace function public.upsert_theory_module(
  p_tenant_id   uuid,
  p_actor       uuid,
  p_id          uuid,
  p_code        text,
  p_title       text,
  p_description text,
  p_active      boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_code   text;
  v_title  text;
  v_desc   text;
  v_active boolean := coalesce(p_active, true);
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage theory modules in tenant %', p_actor, p_tenant_id;
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'theory module title cannot be empty';
  end if;
  v_code := nullif(trim(coalesce(p_code, '')), '');
  v_desc := nullif(trim(coalesce(p_description, '')), '');

  if p_id is null then
    insert into public.theory_modules (tenant_id, code, title, description, active)
    values (p_tenant_id, v_code, v_title, v_desc, v_active)
    returning id into v_id;
  else
    update public.theory_modules
       set code = v_code,
           title = v_title,
           description = v_desc,
           active = v_active
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
    if v_id is null then
      raise exception 'theory module % not found in tenant %', p_id, p_tenant_id;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'theory_module.upserted', 'theory_module', v_id::text,
    jsonb_build_object('created', p_id is null, 'active', v_active)
  );

  return v_id;
end;
$$;
revoke all on function public.upsert_theory_module(uuid, uuid, uuid, text, text, text, boolean) from public;
grant execute on function public.upsert_theory_module(uuid, uuid, uuid, text, text, text, boolean) to service_role;

-- 5. set_theory_module_active ------------------------------------------------
create or replace function public.set_theory_module_active(
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
    raise exception 'actor % not authorized to manage theory modules in tenant %', p_actor, p_tenant_id;
  end if;

  update public.theory_modules
     set active = coalesce(p_active, true)
   where id = p_id and tenant_id = p_tenant_id
  returning id into v_found;
  if v_found is null then
    raise exception 'theory module % not found in tenant %', p_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case when coalesce(p_active, true) then 'theory_module.activated' else 'theory_module.archived' end,
    'theory_module', p_id::text, '{}'::jsonb
  );
end;
$$;
revoke all on function public.set_theory_module_active(uuid, uuid, uuid, boolean) from public;
grant execute on function public.set_theory_module_active(uuid, uuid, uuid, boolean) to service_role;

-- 6. set_theory_module_skills (replace coupling set) -------------------------
create or replace function public.set_theory_module_skills(
  p_tenant_id uuid,
  p_actor     uuid,
  p_module_id uuid,
  p_skill_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skill uuid;
  v_level smallint;
  v_active boolean;
  v_count integer := 0;
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage theory modules in tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.theory_modules tm
     where tm.id = p_module_id and tm.tenant_id = p_tenant_id
  ) then
    raise exception 'theory module % not found in tenant %', p_module_id, p_tenant_id;
  end if;

  delete from public.theory_module_skills where theory_module_id = p_module_id;
  if p_skill_ids is not null then
    foreach v_skill in array p_skill_ids loop
      select level, active into v_level, v_active
        from public.skill_taxonomy
       where id = v_skill and tenant_id = p_tenant_id;
      if v_level is null then
        raise exception 'skill % not found in tenant %', v_skill, p_tenant_id;
      end if;
      if v_level <> 3 then
        raise exception 'skill % is not a gradable leaf (level=%)', v_skill, v_level;
      end if;
      insert into public.theory_module_skills (theory_module_id, tenant_id, skill_id)
      values (p_module_id, p_tenant_id, v_skill)
      on conflict (theory_module_id, skill_id) do nothing;
      v_count := v_count + 1;
    end loop;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'theory_module.skills_set', 'theory_module', p_module_id::text,
    jsonb_build_object('skill_count', v_count)
  );
end;
$$;
revoke all on function public.set_theory_module_skills(uuid, uuid, uuid, uuid[]) from public;
grant execute on function public.set_theory_module_skills(uuid, uuid, uuid, uuid[]) to service_role;

-- 7. assign_theory_homework (instructor/admin) -------------------------------
create or replace function public.assign_theory_homework(
  p_tenant_id uuid,
  p_actor     uuid,
  p_student_id uuid,
  p_module_id  uuid,
  p_lesson_id  uuid,
  p_deadline   date,
  p_note       text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_note text;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.theory_modules tm
     where tm.id = p_module_id and tm.tenant_id = p_tenant_id and tm.active = true
  ) then
    raise exception 'active theory module % not found in tenant %', p_module_id, p_tenant_id;
  end if;
  if p_lesson_id is not null and not exists (
    select 1 from public.lessons l
     where l.id = p_lesson_id and l.tenant_id = p_tenant_id and l.student_id = p_student_id
  ) then
    raise exception 'lesson % not found for student % in tenant %', p_lesson_id, p_student_id, p_tenant_id;
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.theory_homework (
    tenant_id, student_id, theory_module_id, lesson_id, status, deadline, note, assigned_by
  ) values (
    p_tenant_id, p_student_id, p_module_id, p_lesson_id, 'open', p_deadline, v_note, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'theory_homework.assigned', 'theory_homework', v_id::text,
    jsonb_build_object('student_id', p_student_id, 'module_id', p_module_id, 'deadline', p_deadline)
  );

  return v_id;
end;
$$;
revoke all on function public.assign_theory_homework(uuid, uuid, uuid, uuid, uuid, date, text) from public;
grant execute on function public.assign_theory_homework(uuid, uuid, uuid, uuid, uuid, date, text) to service_role;

-- 8. set_theory_homework_status (staff OR student owner) ---------------------
-- The student (or guardian) may mark their own homework done/open; staff may
-- set any status incl. 'cancelled'. Only staff may cancel.
create or replace function public.set_theory_homework_status(
  p_tenant_id   uuid,
  p_actor       uuid,
  p_homework_id uuid,
  p_status      public.theory_homework_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_is_staff   boolean;
  v_is_owner   boolean;
begin
  select student_id into v_student_id
    from public.theory_homework
   where id = p_homework_id and tenant_id = p_tenant_id
   for update;
  if v_student_id is null then
    raise exception 'theory homework % not found in tenant %', p_homework_id, p_tenant_id;
  end if;

  v_is_staff := public._lesson_actor_authorized(p_actor, p_tenant_id);
  v_is_owner := exists (
    select 1 from public.students s
     where s.id = v_student_id and s.tenant_id = p_tenant_id and s.user_id = p_actor
  ) or exists (
    select 1 from public.student_guardians g
     where g.student_id = v_student_id and g.tenant_id = p_tenant_id and g.user_id = p_actor
  );

  if not (v_is_staff or v_is_owner) then
    raise exception 'actor % not authorized for theory homework %', p_actor, p_homework_id;
  end if;
  -- Only staff may cancel homework.
  if p_status = 'cancelled' and not v_is_staff then
    raise exception 'only staff may cancel theory homework';
  end if;

  update public.theory_homework
     set status = p_status,
         completed_at = case when p_status = 'done' then now() else null end,
         completed_by = case when p_status = 'done' then p_actor else null end
   where id = p_homework_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'theory_homework.status_set', 'theory_homework', p_homework_id::text,
    jsonb_build_object('status', p_status, 'by_student', v_is_owner and not v_is_staff)
  );
end;
$$;
revoke all on function public.set_theory_homework_status(uuid, uuid, uuid, public.theory_homework_status) from public;
grant execute on function public.set_theory_homework_status(uuid, uuid, uuid, public.theory_homework_status) to service_role;

-- 9. _insert_default_theory_modules (idempotent canon seed) ------------------
-- Inserts a small set of canon theory modules and couples each to the matching
-- praktijkvaardigheden (skill_taxonomy leaves) by code prefix. Skips modules
-- whose code already exists. Couplings are added where missing.
create or replace function public._insert_default_theory_modules(
  p_tenant_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_n     integer := 0;
begin
  -- Modules ------------------------------------------------------------------
  insert into public.theory_modules (tenant_id, code, title, description, sort_order)
  select p_tenant_id, v.code, v.title, v.description, v.sort_order
    from (values
      ('voorrang',        'Voorrangsregels',        'Voorrang op kruispunten, gelijkwaardig en geregeld.', 10),
      ('rotondes',        'Rotondes',               'Naderen, voorrang en positie op de rotonde.',          20),
      ('invoegen',        'Invoegen & uitvoegen',   'Snelheid, ruimte en spiegelgebruik bij in- en uitvoegen.', 30),
      ('verkeersborden',  'Verkeersborden',         'Herkennen en toepassen van verkeersborden.',           40),
      ('gevaarherkenning','Gevaarherkenning',       'Anticiperen op onverwachte en gevaarlijke situaties.', 50),
      ('milieubewust',    'Milieubewust rijden',    'Anticiperen, brandstofbesparing en uitrollen.',        60)
    ) as v(code, title, description, sort_order)
   where not exists (
     select 1 from public.theory_modules tm
      where tm.tenant_id = p_tenant_id and tm.code = v.code
   );
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Couplings (match leaves by code prefix) ----------------------------------
  insert into public.theory_module_skills (theory_module_id, tenant_id, skill_id)
  select tm.id, p_tenant_id, s.id
    from (values
      ('voorrang',        'kruispunten.voorrang.'),
      ('voorrang',        'bijzondere_weggedeelten.inrit_uitrit.voorrang'),
      ('voorrang',        'bijzondere_weggedeelten.voetganger.voorrang'),
      ('rotondes',        'bijzondere_weggedeelten.rotondes.'),
      ('invoegen',        'invoegen_uitvoegen.'),
      ('verkeersborden',  'zelfstandig_rijden.navigeren.verkeersborden'),
      ('gevaarherkenning','zelfstandig_rijden.probleemoplossend.'),
      ('milieubewust',    'voertuigbeheersing.milieubewust.')
    ) as v(module_code, skill_prefix)
    join public.theory_modules tm
      on tm.tenant_id = p_tenant_id and tm.code = v.module_code
    join public.skill_taxonomy s
      on s.tenant_id = p_tenant_id and s.level = 3
     and (s.code = v.skill_prefix or s.code like v.skill_prefix || '%')
   where not exists (
     select 1 from public.theory_module_skills x
      where x.theory_module_id = tm.id and x.skill_id = s.id
   );
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end;
$$;

-- 10. Provision default theory modules for every tenant ----------------------
-- Trigger name sorts AFTER tenants_provision_skill_taxonomy so the taxonomy
-- exists before couplings are matched by code.
create or replace function public._provision_theory_modules_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._insert_default_theory_modules(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_provision_theory_modules on public.tenants;
create trigger tenants_provision_theory_modules
  after insert on public.tenants
  for each row execute function public._provision_theory_modules_for_tenant();

-- Backfill existing tenants (idempotent).
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public._insert_default_theory_modules(t.id);
  end loop;
end $$;

-- 11. Grant lockdown ---------------------------------------------------------
revoke all on function public._insert_default_theory_modules(uuid) from public;
revoke execute on function public._insert_default_theory_modules(uuid) from anon, authenticated;
grant execute on function public._insert_default_theory_modules(uuid) to service_role;

revoke all on function public._provision_theory_modules_for_tenant() from public;
revoke execute on function public._provision_theory_modules_for_tenant() from anon, authenticated;
grant execute on function public._provision_theory_modules_for_tenant() to service_role;
