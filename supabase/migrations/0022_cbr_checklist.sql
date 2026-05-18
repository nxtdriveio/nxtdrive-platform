-- 0022_cbr_checklist.sql
-- CBR exam-readiness checklist.
--
-- Two tables:
--   * cbr_competencies         — tenant-configurable list of competencies
--                                (e.g. snelweg, bochten, parkeren, file).
--   * student_cbr_progress     — per-student tick of each competency, with
--                                the actor + timestamp that ticked it.
--
-- Writes are service-role only through SECURITY DEFINER RPCs:
--   * seed_default_cbr_competencies(p_tenant_id, p_actor)
--   * set_student_cbr_progress(p_student_id, p_tenant_id, p_actor,
--                              p_competency_id, p_achieved)
--
-- Reads are RLS-enforced:
--   * cbr_competencies        — any member of the tenant may read.
--   * student_cbr_progress    — tenant_admin / instructor see all in tenant;
--                                a student/parent sees only their own
--                                student's rows.

-- cbr_competencies -----------------------------------------------------------
create table if not exists public.cbr_competencies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  code        text not null,
  label       text not null,
  sort_order  smallint not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(code)  between 1 and 64),
  check (char_length(label) between 1 and 200),
  unique (tenant_id, code)
);

drop trigger if exists cbr_competencies_set_updated_at on public.cbr_competencies;
create trigger cbr_competencies_set_updated_at
  before update on public.cbr_competencies
  for each row execute function public.set_updated_at();

create index if not exists idx_cbr_competencies_tenant_sort
  on public.cbr_competencies (tenant_id, sort_order, label);

alter table public.cbr_competencies
  drop constraint if exists cbr_competencies_id_tenant_unique;
alter table public.cbr_competencies
  add constraint cbr_competencies_id_tenant_unique unique (id, tenant_id);

alter table public.cbr_competencies enable row level security;

drop policy if exists cbr_competencies_select_members on public.cbr_competencies;
create policy cbr_competencies_select_members on public.cbr_competencies
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
-- no insert/update/delete policies — writes go through RPCs (service role)

-- student_cbr_progress -------------------------------------------------------
create table if not exists public.student_cbr_progress (
  student_id     uuid not null,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  competency_id  uuid not null,
  achieved_at    timestamptz not null default now(),
  achieved_by    uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (student_id, competency_id),
  constraint student_cbr_progress_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  constraint student_cbr_progress_competency_tenant_fkey
    foreign key (competency_id, tenant_id)
    references public.cbr_competencies (id, tenant_id)
    on delete cascade
);

drop trigger if exists student_cbr_progress_set_updated_at on public.student_cbr_progress;
create trigger student_cbr_progress_set_updated_at
  before update on public.student_cbr_progress
  for each row execute function public.set_updated_at();

create index if not exists idx_student_cbr_progress_student
  on public.student_cbr_progress (student_id);
create index if not exists idx_student_cbr_progress_tenant
  on public.student_cbr_progress (tenant_id);

alter table public.student_cbr_progress enable row level security;

drop policy if exists student_cbr_progress_select_members on public.student_cbr_progress;
create policy student_cbr_progress_select_members on public.student_cbr_progress
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = student_cbr_progress.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = student_cbr_progress.tenant_id
    )
    -- Parents may read the checklist of children they guard, matching the
    -- guardian-aware visibility model used by lessons/credits/invoices.
    or student_id in (
      select g.student_id
        from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = student_cbr_progress.tenant_id
    )
  );
-- no insert/update/delete policies — writes go through RPCs (service role)

-- seed_default_cbr_competencies ---------------------------------------------
-- Idempotent: inserts the default Dutch CBR-aligned competencies for the
-- tenant, skipping any code that already exists. Useful as a one-time
-- bootstrap when onboarding a new tenant.
create or replace function public.seed_default_cbr_competencies(
  p_tenant_id uuid,
  p_actor     uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  with defaults(code, label, sort_order) as (
    values
      ('voertuigbediening',      'Voertuigbediening',            10),
      ('kijktechniek',           'Kijktechniek en spiegelgebruik', 20),
      ('bochten',                'Bochten nemen',                30),
      ('kruispunten',            'Kruispunten',                  40),
      ('voorrang',               'Voorrang verlenen',            50),
      ('snelheid',               'Snelheid aanpassen',           60),
      ('invoegen',               'Invoegen en uitvoegen',        70),
      ('snelweg',                'Snelweg rijden',               80),
      ('file',                   'File rijden',                  90),
      ('parkeren',               'Parkeren',                    100),
      ('bijzondere_verrichtingen','Bijzondere verrichtingen',   110),
      ('milieubewust',           'Milieubewust rijden',         120),
      ('examenoefening',         'Examenoefening',              130)
  )
  insert into public.cbr_competencies (tenant_id, code, label, sort_order)
  select p_tenant_id, d.code, d.label, d.sort_order
    from defaults d
   where not exists (
     select 1 from public.cbr_competencies c
      where c.tenant_id = p_tenant_id and c.code = d.code
   );
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'cbr.defaults_seeded', 'tenant', p_tenant_id::text,
      jsonb_build_object('inserted', v_inserted)
    );
  end if;

  return v_inserted;
end;
$$;
revoke all on function public.seed_default_cbr_competencies(uuid, uuid) from public;
grant execute on function public.seed_default_cbr_competencies(uuid, uuid) to service_role;

-- set_student_cbr_progress --------------------------------------------------
-- Ticks (p_achieved=true) or unticks (false) a competency for a student.
-- Always writes an audit_log row.
create or replace function public.set_student_cbr_progress(
  p_student_id    uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_competency_id uuid,
  p_achieved      boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competency_active boolean;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  -- Validate both rows belong to the same tenant.
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  select active into v_competency_active
    from public.cbr_competencies
   where id = p_competency_id and tenant_id = p_tenant_id;
  if v_competency_active is null then
    raise exception 'competency % not found in tenant %', p_competency_id, p_tenant_id;
  end if;
  if p_achieved and v_competency_active is not true then
    raise exception 'competency % is not active', p_competency_id;
  end if;

  if p_achieved then
    insert into public.student_cbr_progress (
      student_id, tenant_id, competency_id, achieved_at, achieved_by
    ) values (
      p_student_id, p_tenant_id, p_competency_id, now(), p_actor
    )
    on conflict (student_id, competency_id) do update
      set achieved_at = excluded.achieved_at,
          achieved_by = excluded.achieved_by,
          updated_at  = now();
  else
    delete from public.student_cbr_progress
     where student_id = p_student_id
       and competency_id = p_competency_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case when p_achieved then 'cbr.competency_ticked'
                         else 'cbr.competency_unticked' end,
    'student', p_student_id::text,
    jsonb_build_object('competency_id', p_competency_id)
  );
end;
$$;
revoke all on function public.set_student_cbr_progress(uuid, uuid, uuid, uuid, boolean) from public;
grant execute on function public.set_student_cbr_progress(uuid, uuid, uuid, uuid, boolean) to service_role;
