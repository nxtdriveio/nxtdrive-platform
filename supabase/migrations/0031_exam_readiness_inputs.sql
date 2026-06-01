-- 0031_exam_readiness_inputs.sql
-- Leskaart L1 — exam-readiness preconditions.
--
-- The L1 Examenrijpheid-engine (lib/leskaart) derives its advice from the L0
-- 1..10 skill scores PLUS three CBR preconditions the canon ("Examenwaardig")
-- requires: theorie behaald, machtiging geregeld and — indien nodig —
-- gezondheidsverklaring geregeld (canon Module 13 Fase 1 statuses).
--
-- Until now there was no store for these, so this adds a minimal one-row-per-
-- student record. Absence of a row means "nog niets geregeld" (no fabrication).
-- The driving-skill checklist (0022 cbr_competencies) is unrelated — those are
-- driving competencies, not these administrative preconditions.
--
-- Writes are service-role only through a SECURITY DEFINER RPC:
--   * set_student_cbr_status(...)
-- Reads are RLS-enforced, mirroring student_cbr_progress (0022):
--   tenant_admin / instructor see all in their tenant; a student sees their own
--   row; guardians see their children's rows.

create table if not exists public.student_cbr_status (
  student_id                      uuid not null,
  tenant_id                       uuid not null references public.tenants(id) on delete cascade,
  theorie_behaald                 boolean not null default false,
  machtiging_geregeld             boolean not null default false,
  gezondheidsverklaring_vereist   boolean not null default true,
  gezondheidsverklaring_geregeld  boolean not null default false,
  updated_at                      timestamptz not null default now(),
  updated_by                      uuid references auth.users(id) on delete set null,
  primary key (student_id),
  constraint student_cbr_status_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade
);

drop trigger if exists student_cbr_status_set_updated_at on public.student_cbr_status;
create trigger student_cbr_status_set_updated_at
  before update on public.student_cbr_status
  for each row execute function public.set_updated_at();

create index if not exists idx_student_cbr_status_tenant
  on public.student_cbr_status (tenant_id);

alter table public.student_cbr_status enable row level security;

drop policy if exists student_cbr_status_select_members on public.student_cbr_status;
create policy student_cbr_status_select_members on public.student_cbr_status
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = student_cbr_status.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = student_cbr_status.tenant_id
    )
    -- Parents may read the status of children they guard, matching the
    -- guardian-aware visibility model used by lessons/credits/cbr-progress.
    or student_id in (
      select g.student_id
        from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = student_cbr_status.tenant_id
    )
  );
-- no insert/update/delete policies — writes go through the RPC (service role)

-- set_student_cbr_status -----------------------------------------------------
-- Upserts the exam preconditions for a student and always writes an audit row.
create or replace function public.set_student_cbr_status(
  p_student_id                      uuid,
  p_tenant_id                       uuid,
  p_actor                           uuid,
  p_theorie_behaald                 boolean,
  p_machtiging_geregeld             boolean,
  p_gezondheidsverklaring_vereist   boolean,
  p_gezondheidsverklaring_geregeld  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.student_cbr_status (
    student_id, tenant_id,
    theorie_behaald, machtiging_geregeld,
    gezondheidsverklaring_vereist, gezondheidsverklaring_geregeld,
    updated_at, updated_by
  ) values (
    p_student_id, p_tenant_id,
    coalesce(p_theorie_behaald, false),
    coalesce(p_machtiging_geregeld, false),
    coalesce(p_gezondheidsverklaring_vereist, true),
    coalesce(p_gezondheidsverklaring_geregeld, false),
    now(), p_actor
  )
  on conflict (student_id) do update
    set theorie_behaald                = excluded.theorie_behaald,
        machtiging_geregeld            = excluded.machtiging_geregeld,
        gezondheidsverklaring_vereist  = excluded.gezondheidsverklaring_vereist,
        gezondheidsverklaring_geregeld = excluded.gezondheidsverklaring_geregeld,
        updated_at                     = now(),
        updated_by                     = p_actor;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'cbr.status_set', 'student', p_student_id::text,
    jsonb_build_object(
      'theorie_behaald',                coalesce(p_theorie_behaald, false),
      'machtiging_geregeld',            coalesce(p_machtiging_geregeld, false),
      'gezondheidsverklaring_vereist',  coalesce(p_gezondheidsverklaring_vereist, true),
      'gezondheidsverklaring_geregeld', coalesce(p_gezondheidsverklaring_geregeld, false)
    )
  );
end;
$$;
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default; revoking PUBLIC alone is not enough, so revoke those roles too
-- (matches the 0023/0030 lockdown). Writes stay service-role only.
revoke all on function public.set_student_cbr_status(uuid, uuid, uuid, boolean, boolean, boolean, boolean) from public;
revoke execute on function public.set_student_cbr_status(uuid, uuid, uuid, boolean, boolean, boolean, boolean) from anon, authenticated;
grant execute on function public.set_student_cbr_status(uuid, uuid, uuid, boolean, boolean, boolean, boolean) to service_role;
