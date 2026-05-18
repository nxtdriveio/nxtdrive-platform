-- 0016_lesson_progress.sql
-- Phase 2E (instructor dashboard) backend additions:
--   * lesson_notes: free-form per-lesson commentary, insert-only via RPC
--   * lessons.progress_score / progress_summary: per-lesson voortgangsscore
--   * mark_lesson_no_show RPC (no refund, audit only)
--   * add_lesson_note RPC
--   * set_lesson_progress RPC
-- All writes go through security-definer RPCs gated by _lesson_actor_authorized
-- so the Next.js layer cannot forge actor identity.

create table if not exists public.lesson_notes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete restrict,
  body            text not null,
  created_at      timestamptz not null default now(),
  check (length(body) between 1 and 4000)
);

create index if not exists idx_lesson_notes_lesson
  on public.lesson_notes (lesson_id, created_at desc);
create index if not exists idx_lesson_notes_tenant
  on public.lesson_notes (tenant_id, created_at desc);

alter table public.lesson_notes enable row level security;

drop policy if exists lesson_notes_select_members on public.lesson_notes;
create policy lesson_notes_select_members on public.lesson_notes
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.lessons l
        join public.students s on s.id = l.student_id
       where l.id = lesson_notes.lesson_id
         and s.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through RPCs (service role).

-- Progress fields on lessons -----------------------------------------------
alter table public.lessons
  add column if not exists progress_score   smallint,
  add column if not exists progress_summary text;

do $$ begin
  alter table public.lessons
    add constraint lessons_progress_score_range
    check (progress_score is null or (progress_score between 0 and 10));
exception when duplicate_object then null; end $$;

-- mark_lesson_no_show ------------------------------------------------------
create or replace function public.mark_lesson_no_show(
  p_lesson_id uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.lesson_status;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select status into v_status
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_status is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_status <> 'planned' then
    raise exception 'lesson % is not planned (status=%)', p_lesson_id, v_status;
  end if;

  update public.lessons
     set status = 'no_show'
   where id = p_lesson_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.no_show', 'lesson', p_lesson_id::text,
    '{}'::jsonb
  );
end;
$$;
revoke all on function public.mark_lesson_no_show(uuid, uuid, uuid) from public;
grant execute on function public.mark_lesson_no_show(uuid, uuid, uuid) to service_role;

-- add_lesson_note ----------------------------------------------------------
create or replace function public.add_lesson_note(
  p_lesson_id uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_body      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note_id uuid;
  v_body    text;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 then
    raise exception 'note body cannot be empty';
  end if;
  if length(v_body) > 4000 then
    raise exception 'note body too long (max 4000 chars)';
  end if;
  if not exists (
    select 1 from public.lessons
     where id = p_lesson_id and tenant_id = p_tenant_id
  ) then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  insert into public.lesson_notes (
    tenant_id, lesson_id, author_user_id, body
  ) values (
    p_tenant_id, p_lesson_id, p_actor, v_body
  )
  returning id into v_note_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.note_added', 'lesson', p_lesson_id::text,
    jsonb_build_object('note_id', v_note_id)
  );

  return v_note_id;
end;
$$;
revoke all on function public.add_lesson_note(uuid, uuid, uuid, text) from public;
grant execute on function public.add_lesson_note(uuid, uuid, uuid, text) to service_role;

-- set_lesson_progress ------------------------------------------------------
create or replace function public.set_lesson_progress(
  p_lesson_id uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_score     smallint,
  p_summary   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status  public.lesson_status;
  v_summary text;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_score is not null and (p_score < 0 or p_score > 10) then
    raise exception 'progress score must be between 0 and 10';
  end if;

  select status into v_status
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_status is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_status not in ('planned', 'completed') then
    raise exception 'cannot record progress on lesson with status %', v_status;
  end if;

  v_summary := nullif(trim(coalesce(p_summary, '')), '');

  update public.lessons
     set progress_score   = p_score,
         progress_summary = v_summary
   where id = p_lesson_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.progress_set', 'lesson', p_lesson_id::text,
    jsonb_build_object('score', p_score, 'has_summary', v_summary is not null)
  );
end;
$$;
revoke all on function public.set_lesson_progress(uuid, uuid, uuid, smallint, text) from public;
grant execute on function public.set_lesson_progress(uuid, uuid, uuid, smallint, text) to service_role;
