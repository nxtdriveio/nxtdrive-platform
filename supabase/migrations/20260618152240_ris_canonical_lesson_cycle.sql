-- RIS canonical lesson cycle:
-- planning card -> concept RIS lesson card -> guided reflection -> publish
-- -> optional student response -> fully completed.

alter type public.ris_lesson_card_status add value if not exists 'completion_in_progress';
alter type public.ris_lesson_card_status add value if not exists 'ready_to_publish';
alter type public.ris_lesson_card_status add value if not exists 'published_to_student';
alter type public.ris_lesson_card_status add value if not exists 'waiting_for_student_response';
alter type public.ris_lesson_card_status add value if not exists 'fully_completed';

alter table public.ris_guided_reflections
  add column if not exists instructor_id uuid references auth.users(id) on delete set null,
  add column if not exists overall_rating text,
  add column if not exists independence_rating text,
  add column if not exists insight_rating text,
  add column if not exists confidence_rating text,
  add column if not exists one_sentence_reflection text,
  add column if not exists captured_at timestamptz,
  add column if not exists published_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ris_guided_reflections_overall_rating_check'
       and conrelid = 'public.ris_guided_reflections'::regclass
  ) then
    alter table public.ris_guided_reflections
      add constraint ris_guided_reflections_overall_rating_check
      check (
        overall_rating is null or overall_rating in (
          'very_insufficient',
          'insufficient',
          'moderate',
          'sufficient',
          'very_sufficient'
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'ris_guided_reflections_independence_rating_check'
       and conrelid = 'public.ris_guided_reflections'::regclass
  ) then
    alter table public.ris_guided_reflections
      add constraint ris_guided_reflections_independence_rating_check
      check (
        independence_rating is null or independence_rating in (
          'very_insufficient',
          'insufficient',
          'moderate',
          'sufficient',
          'very_sufficient'
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'ris_guided_reflections_insight_rating_check'
       and conrelid = 'public.ris_guided_reflections'::regclass
  ) then
    alter table public.ris_guided_reflections
      add constraint ris_guided_reflections_insight_rating_check
      check (
        insight_rating is null or insight_rating in (
          'very_insufficient',
          'insufficient',
          'moderate',
          'sufficient',
          'very_sufficient'
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'ris_guided_reflections_confidence_rating_check'
       and conrelid = 'public.ris_guided_reflections'::regclass
  ) then
    alter table public.ris_guided_reflections
      add constraint ris_guided_reflections_confidence_rating_check
      check (
        confidence_rating is null or confidence_rating in (
          'very_insufficient',
          'insufficient',
          'moderate',
          'sufficient',
          'very_sufficient'
        )
      );
  end if;
end;
$$;

create table if not exists public.student_post_lesson_responses (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  lesson_card_id     uuid not null,
  student_id         uuid not null,
  comment_text       text,
  next_lesson_wish   text,
  skipped_response   boolean not null default false,
  submitted_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (lesson_card_id),
  constraint student_post_lesson_responses_card_tenant_fkey
    foreign key (lesson_card_id, tenant_id)
    references public.ris_lesson_cards (id, tenant_id)
    on delete cascade,
  constraint student_post_lesson_responses_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  check (
    skipped_response
    or nullif(trim(coalesce(comment_text, '')), '') is not null
    or nullif(trim(coalesce(next_lesson_wish, '')), '') is not null
  )
);

drop trigger if exists student_post_lesson_responses_set_updated_at
  on public.student_post_lesson_responses;
create trigger student_post_lesson_responses_set_updated_at
  before update on public.student_post_lesson_responses
  for each row execute function public.set_updated_at();

create index if not exists idx_student_post_lesson_responses_student
  on public.student_post_lesson_responses (tenant_id, student_id, submitted_at desc);

create table if not exists public.planning_cards (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  student_id               uuid not null,
  instructor_id            uuid not null references auth.users(id) on delete restrict,
  next_lesson_id           uuid references public.lessons(id) on delete set null,
  previous_lesson_card_id  uuid,
  status                   text not null default 'draft',
  student_visible_summary  text,
  instructor_note          text,
  shared_with_student      boolean not null default false,
  shared_at                timestamptz,
  confirmed_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, next_lesson_id),
  constraint planning_cards_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  constraint planning_cards_previous_card_tenant_fkey
    foreign key (previous_lesson_card_id, tenant_id)
    references public.ris_lesson_cards (id, tenant_id)
    on delete set null,
  check (
    status in (
      'draft',
      'submitted_by_instructor',
      'shared_with_student',
      'used_in_lesson',
      'evaluated',
      'archived'
    )
  )
);

drop trigger if exists planning_cards_set_updated_at on public.planning_cards;
create trigger planning_cards_set_updated_at
  before update on public.planning_cards
  for each row execute function public.set_updated_at();

create index if not exists idx_planning_cards_student
  on public.planning_cards (tenant_id, student_id, created_at desc);
create index if not exists idx_planning_cards_shared
  on public.planning_cards (tenant_id, shared_with_student, shared_at desc);

create table if not exists public.planning_card_goals (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  planning_card_id uuid not null,
  title            text not null,
  description      text,
  status           text not null default 'active',
  sort_order       smallint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint planning_card_goals_card_tenant_fkey
    foreign key (planning_card_id, tenant_id)
    references public.planning_cards (id, tenant_id)
    on delete cascade,
  check (char_length(trim(title)) between 1 and 180),
  check (
    status in (
      'active',
      'achieved',
      'in_progress',
      'carry_forward',
      'archived'
    )
  )
);

drop trigger if exists planning_card_goals_set_updated_at
  on public.planning_card_goals;
create trigger planning_card_goals_set_updated_at
  before update on public.planning_card_goals
  for each row execute function public.set_updated_at();

create index if not exists idx_planning_card_goals_card
  on public.planning_card_goals (planning_card_id, sort_order, created_at);

alter table public.student_post_lesson_responses enable row level security;
alter table public.planning_cards enable row level security;
alter table public.planning_card_goals enable row level security;

drop policy if exists student_post_lesson_responses_select_members
  on public.student_post_lesson_responses;
create policy student_post_lesson_responses_select_members
  on public.student_post_lesson_responses
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = student_post_lesson_responses.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id from public.students s
       where s.user_id = auth.uid()
         and s.tenant_id = student_post_lesson_responses.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id = auth.uid()
         and g.tenant_id = student_post_lesson_responses.tenant_id
    )
  );

drop policy if exists planning_cards_select_members on public.planning_cards;
create policy planning_cards_select_members
  on public.planning_cards
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = planning_cards.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or (
      shared_with_student
      and (
        student_id in (
          select s.id from public.students s
           where s.user_id = auth.uid()
             and s.tenant_id = planning_cards.tenant_id
        )
        or student_id in (
          select g.student_id from public.student_guardians g
           where g.user_id = auth.uid()
             and g.tenant_id = planning_cards.tenant_id
        )
      )
    )
  );

drop policy if exists planning_cards_write_staff on public.planning_cards;
create policy planning_cards_write_staff
  on public.planning_cards
  for all using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = planning_cards.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = planning_cards.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  );

drop policy if exists planning_card_goals_select_members
  on public.planning_card_goals;
create policy planning_card_goals_select_members
  on public.planning_card_goals
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.planning_cards c
       where c.id = planning_card_goals.planning_card_id
         and c.tenant_id = planning_card_goals.tenant_id
         and (
           exists (
             select 1 from public.memberships m
              where m.user_id = auth.uid()
                and m.tenant_id = c.tenant_id
                and m.role in ('tenant_admin', 'instructor')
           )
           or (
             c.shared_with_student
             and (
               c.student_id in (
                 select s.id from public.students s
                  where s.user_id = auth.uid()
                    and s.tenant_id = c.tenant_id
               )
               or c.student_id in (
                 select g.student_id from public.student_guardians g
                  where g.user_id = auth.uid()
                    and g.tenant_id = c.tenant_id
               )
             )
           )
         )
    )
  );

drop policy if exists planning_card_goals_write_staff
  on public.planning_card_goals;
create policy planning_card_goals_write_staff
  on public.planning_card_goals
  for all using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = planning_card_goals.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = planning_card_goals.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  );

grant select, insert, update on public.student_post_lesson_responses to authenticated;
grant select, insert, update, delete on public.planning_cards to authenticated;
grant select, insert, update, delete on public.planning_card_goals to authenticated;

create or replace function public.set_ris_concept_score(
  p_tenant_id uuid,
  p_lesson_id uuid,
  p_actor uuid,
  p_script_id uuid,
  p_script_variant_id uuid,
  p_concept_ris_step text,
  p_status public.ris_script_status,
  p_is_attention_point boolean,
  p_is_featured_for_lesson boolean,
  p_should_repeat boolean,
  p_ready_for_test boolean,
  p_instructor_note text,
  p_student_visible_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
  v_lesson public.lessons%rowtype;
  v_previous text;
  v_assessment_id uuid;
begin
  if not public._ris_step_valid(p_concept_ris_step) then
    raise exception 'invalid RIS step %', p_concept_ris_step;
  end if;
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_lesson
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_lesson.id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  if not exists (select 1 from public.ris_scripts where id = p_script_id and is_active = true) then
    raise exception 'RIS script % not found or inactive', p_script_id;
  end if;
  if p_script_variant_id is not null and not exists (
    select 1 from public.ris_script_variants
     where id = p_script_variant_id and script_id = p_script_id and is_active = true
  ) then
    raise exception 'RIS script variant % not found for script %', p_script_variant_id, p_script_id;
  end if;

  v_card_id := public._ensure_ris_lesson_card(p_tenant_id, p_lesson_id, p_actor);

  if exists (
    select 1
      from public.ris_lesson_cards
     where id = v_card_id
       and publication_status not in ('draft', 'completion_in_progress', 'ready_to_publish')
  ) then
    raise exception 'RIS lesson card % is already shared with the student', v_card_id;
  end if;

  select current_final_step into v_previous
    from public.student_ris_progress
   where tenant_id = p_tenant_id
     and student_id = v_lesson.student_id
     and script_id = p_script_id;

  insert into public.ris_script_assessments (
    tenant_id, student_id, lesson_id, lesson_card_id, script_id, script_variant_id,
    previous_ris_step, concept_ris_step, status, is_attention_point,
    is_featured_for_lesson, should_repeat, ready_for_test, instructor_note,
    student_visible_note
  ) values (
    p_tenant_id, v_lesson.student_id, p_lesson_id, v_card_id, p_script_id, p_script_variant_id,
    v_previous, p_concept_ris_step, coalesce(p_status, 'progressing'),
    coalesce(p_is_attention_point, false), coalesce(p_is_featured_for_lesson, false),
    coalesce(p_should_repeat, false), coalesce(p_ready_for_test, false),
    nullif(trim(coalesce(p_instructor_note, '')), ''),
    nullif(trim(coalesce(p_student_visible_note, '')), '')
  )
  on conflict (lesson_card_id, script_id) do update
    set concept_ris_step = excluded.concept_ris_step,
        status = excluded.status,
        is_attention_point = excluded.is_attention_point,
        is_featured_for_lesson = excluded.is_featured_for_lesson,
        should_repeat = excluded.should_repeat,
        ready_for_test = excluded.ready_for_test,
        instructor_note = excluded.instructor_note,
        student_visible_note = excluded.student_visible_note
  returning id into v_assessment_id;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.concept_score_set', 'ris_script_assessment', v_assessment_id::text,
    jsonb_build_object('lesson_id', p_lesson_id, 'script_id', p_script_id, 'concept_ris_step', p_concept_ris_step)
  );

  return v_assessment_id;
end;
$$;

create or replace function public._ris_rating_number(p_rating text)
returns smallint
language sql
immutable
as $$
  select case p_rating
    when 'very_insufficient' then 1
    when 'insufficient' then 3
    when 'moderate' then 5
    when 'sufficient' then 7
    when 'very_sufficient' then 8
    else null
  end::smallint;
$$;

create or replace function public.set_ris_guided_reflection_v2(
  p_lesson_card_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_student_present boolean,
  p_overall_rating text,
  p_independence_rating text,
  p_insight_rating text,
  p_confidence_rating text,
  p_one_sentence_reflection text,
  p_instructor_context_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.ris_lesson_cards%rowtype;
  v_allowed text[] := array[
    'very_insufficient',
    'insufficient',
    'moderate',
    'sufficient',
    'very_sufficient'
  ];
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  select * into v_card
    from public.ris_lesson_cards
   where id = p_lesson_card_id and tenant_id = p_tenant_id
   for update;
  if v_card.id is null then
    raise exception 'RIS lesson card % not found in tenant %', p_lesson_card_id, p_tenant_id;
  end if;
  if v_card.publication_status not in ('draft', 'completion_in_progress', 'ready_to_publish') then
    raise exception 'RIS lesson card % is already shared with the student', p_lesson_card_id;
  end if;
  if p_overall_rating is not null and not p_overall_rating = any(v_allowed) then
    raise exception 'invalid overall rating %', p_overall_rating;
  end if;
  if p_independence_rating is not null and not p_independence_rating = any(v_allowed) then
    raise exception 'invalid independence rating %', p_independence_rating;
  end if;
  if p_insight_rating is not null and not p_insight_rating = any(v_allowed) then
    raise exception 'invalid insight rating %', p_insight_rating;
  end if;
  if p_confidence_rating is not null and not p_confidence_rating = any(v_allowed) then
    raise exception 'invalid confidence rating %', p_confidence_rating;
  end if;

  update public.ris_lesson_cards
     set publication_status = 'completion_in_progress'
   where id = p_lesson_card_id
     and tenant_id = p_tenant_id
     and publication_status = 'draft';

  insert into public.ris_guided_reflections (
    lesson_card_id, tenant_id, lesson_id, student_id, captured_by, instructor_id,
    student_present, rating_overall, rating_independence, overall_rating,
    independence_rating, insight_rating, confidence_rating, went_well_text,
    difficult_text, next_lesson_wish, one_sentence_reflection,
    instructor_context_note, captured_at
  ) values (
    p_lesson_card_id, p_tenant_id, v_card.lesson_id, v_card.student_id, p_actor, p_actor,
    coalesce(p_student_present, true), public._ris_rating_number(p_overall_rating),
    public._ris_rating_number(p_independence_rating), p_overall_rating,
    p_independence_rating, p_insight_rating, p_confidence_rating, null,
    null, null, nullif(trim(coalesce(p_one_sentence_reflection, '')), ''),
    nullif(trim(coalesce(p_instructor_context_note, '')), ''), now()
  )
  on conflict (lesson_card_id) do update
    set captured_by = p_actor,
        instructor_id = p_actor,
        student_present = coalesce(p_student_present, true),
        rating_overall = public._ris_rating_number(p_overall_rating),
        rating_independence = public._ris_rating_number(p_independence_rating),
        overall_rating = p_overall_rating,
        independence_rating = p_independence_rating,
        insight_rating = p_insight_rating,
        confidence_rating = p_confidence_rating,
        one_sentence_reflection = nullif(trim(coalesce(p_one_sentence_reflection, '')), ''),
        instructor_context_note = nullif(trim(coalesce(p_instructor_context_note, '')), ''),
        captured_at = now();

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.guided_reflection_set', 'ris_lesson_card', p_lesson_card_id::text,
    jsonb_build_object('student_present', coalesce(p_student_present, true), 'method', 'ris_v2')
  );
end;
$$;

create or replace function public.publish_ris_lesson_card(
  p_lesson_card_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_internal_summary text,
  p_student_friendly_summary text,
  p_homework_or_next_focus text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.ris_lesson_cards%rowtype;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_card
    from public.ris_lesson_cards
   where id = p_lesson_card_id and tenant_id = p_tenant_id
   for update;
  if v_card.id is null then
    raise exception 'RIS lesson card % not found in tenant %', p_lesson_card_id, p_tenant_id;
  end if;
  if v_card.publication_status not in ('draft', 'completion_in_progress', 'ready_to_publish') then
    raise exception 'RIS lesson card % is already shared with the student', p_lesson_card_id;
  end if;
  if not exists (
    select 1
      from public.ris_script_assessments
     where lesson_card_id = p_lesson_card_id
       and tenant_id = p_tenant_id
       and concept_ris_step is not null
  ) then
    raise exception 'RIS lesson card % cannot be published without concept scores', p_lesson_card_id;
  end if;
  if not exists (
    select 1
      from public.ris_guided_reflections
     where lesson_card_id = p_lesson_card_id
       and tenant_id = p_tenant_id
       and nullif(trim(coalesce(one_sentence_reflection, '')), '') is not null
  ) then
    raise exception 'RIS lesson card % cannot be published without guided reflection', p_lesson_card_id;
  end if;

  update public.ris_script_assessments
     set final_ris_step = concept_ris_step
   where lesson_card_id = p_lesson_card_id
     and tenant_id = p_tenant_id
     and concept_ris_step is not null;

  update public.ris_lesson_cards
     set publication_status = 'waiting_for_student_response',
         internal_summary = nullif(trim(coalesce(p_internal_summary, '')), ''),
         student_friendly_summary = nullif(trim(coalesce(p_student_friendly_summary, '')), ''),
         homework_or_next_focus = nullif(trim(coalesce(p_homework_or_next_focus, '')), ''),
         published_at = now(),
         published_by = p_actor
   where id = p_lesson_card_id and tenant_id = p_tenant_id;

  update public.ris_guided_reflections
     set published_at = now()
   where lesson_card_id = p_lesson_card_id
     and tenant_id = p_tenant_id;

  perform public.recompute_student_ris_progress(p_tenant_id, v_card.student_id, p_actor);

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.lesson_card_published', 'ris_lesson_card', p_lesson_card_id::text,
    jsonb_build_object('lesson_id', v_card.lesson_id, 'student_id', v_card.student_id, 'status', 'waiting_for_student_response')
  );
end;
$$;

create or replace function public.mark_ris_lesson_card_student_response(
  p_lesson_card_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_comment_text text,
  p_next_lesson_wish text,
  p_skipped_response boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.ris_lesson_cards%rowtype;
  v_response_id uuid;
begin
  select * into v_card
    from public.ris_lesson_cards
   where id = p_lesson_card_id
     and tenant_id = p_tenant_id
     and publication_status in ('published', 'published_to_student', 'waiting_for_student_response', 'fully_completed')
   for update;

  if v_card.id is null then
    raise exception 'Gepubliceerde RIS-leskaart niet gevonden.';
  end if;

  if not exists (
    select 1 from public.students s
     where s.id = v_card.student_id
       and s.tenant_id = p_tenant_id
       and s.user_id = p_actor
  ) and not exists (
    select 1 from public.student_guardians g
     where g.student_id = v_card.student_id
       and g.tenant_id = p_tenant_id
       and g.user_id = p_actor
  ) then
    raise exception 'Geen toegang tot deze leskaart.';
  end if;

  if not coalesce(p_skipped_response, false)
     and nullif(trim(coalesce(p_comment_text, '')), '') is null
     and nullif(trim(coalesce(p_next_lesson_wish, '')), '') is null then
    raise exception 'Vul een opmerking of leerwens in, of kies overslaan.';
  end if;

  insert into public.student_post_lesson_responses (
    tenant_id, lesson_card_id, student_id, comment_text, next_lesson_wish,
    skipped_response, submitted_at
  ) values (
    p_tenant_id, p_lesson_card_id, v_card.student_id,
    nullif(trim(coalesce(p_comment_text, '')), ''),
    nullif(trim(coalesce(p_next_lesson_wish, '')), ''),
    coalesce(p_skipped_response, false),
    now()
  )
  on conflict (lesson_card_id) do update
    set comment_text = excluded.comment_text,
        next_lesson_wish = excluded.next_lesson_wish,
        skipped_response = excluded.skipped_response,
        submitted_at = now()
  returning id into v_response_id;

  update public.ris_lesson_cards
     set publication_status = 'fully_completed'
   where id = p_lesson_card_id
     and tenant_id = p_tenant_id;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.student_response_submitted', 'ris_lesson_card', p_lesson_card_id::text,
    jsonb_build_object('skipped', coalesce(p_skipped_response, false))
  );

  return v_response_id;
end;
$$;

revoke all on function public.set_ris_guided_reflection_v2(
  uuid, uuid, uuid, boolean, text, text, text, text, text, text
) from public;
grant execute on function public.set_ris_guided_reflection_v2(
  uuid, uuid, uuid, boolean, text, text, text, text, text, text
) to service_role;

revoke all on function public.mark_ris_lesson_card_student_response(
  uuid, uuid, uuid, text, text, boolean
) from public;
grant execute on function public.mark_ris_lesson_card_student_response(
  uuid, uuid, uuid, text, text, boolean
) to service_role;

drop policy if exists ris_lesson_cards_select_members on public.ris_lesson_cards;
create policy ris_lesson_cards_select_members on public.ris_lesson_cards
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = ris_lesson_cards.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or (
      publication_status::text in (
        'published',
        'published_to_student',
        'waiting_for_student_response',
        'fully_completed'
      )
      and student_id in (
        select s.id from public.students s
         where s.user_id = auth.uid()
           and s.tenant_id = ris_lesson_cards.tenant_id
      )
    )
    or (
      publication_status::text in (
        'published',
        'published_to_student',
        'waiting_for_student_response',
        'fully_completed'
      )
      and student_id in (
        select g.student_id from public.student_guardians g
         where g.user_id = auth.uid()
           and g.tenant_id = ris_lesson_cards.tenant_id
      )
    )
  );

drop policy if exists ris_script_assessments_select_members
  on public.ris_script_assessments;
create policy ris_script_assessments_select_members
  on public.ris_script_assessments
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = ris_script_assessments.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1 from public.ris_lesson_cards c
       where c.id = ris_script_assessments.lesson_card_id
         and c.tenant_id = ris_script_assessments.tenant_id
         and c.publication_status::text in (
           'published',
           'published_to_student',
           'waiting_for_student_response',
           'fully_completed'
         )
         and (
           c.student_id in (
             select s.id from public.students s
              where s.user_id = auth.uid()
                and s.tenant_id = c.tenant_id
           )
           or c.student_id in (
             select g.student_id from public.student_guardians g
              where g.user_id = auth.uid()
                and g.tenant_id = c.tenant_id
           )
         )
    )
  );

drop policy if exists ris_guided_reflections_select_members
  on public.ris_guided_reflections;
create policy ris_guided_reflections_select_members
  on public.ris_guided_reflections
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = ris_guided_reflections.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1 from public.ris_lesson_cards c
       where c.id = ris_guided_reflections.lesson_card_id
         and c.tenant_id = ris_guided_reflections.tenant_id
         and c.publication_status::text in (
           'published',
           'published_to_student',
           'waiting_for_student_response',
           'fully_completed'
         )
         and (
           c.student_id in (
             select s.id from public.students s
              where s.user_id = auth.uid()
                and s.tenant_id = c.tenant_id
           )
           or c.student_id in (
             select g.student_id from public.student_guardians g
              where g.user_id = auth.uid()
                and g.tenant_id = c.tenant_id
           )
         )
    )
  );

create or replace function public.recompute_student_ris_progress(
  p_tenant_id uuid,
  p_student_id uuid,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  delete from public.student_ris_progress
   where tenant_id = p_tenant_id and student_id = p_student_id;

  insert into public.student_ris_progress (
    tenant_id, student_id, script_id, script_variant_id, current_final_step,
    last_assessed_lesson_id, last_assessed_at, is_attention_point,
    is_completed, ready_for_module_test
  )
  select distinct on (a.script_id)
    a.tenant_id,
    a.student_id,
    a.script_id,
    a.script_variant_id,
    a.final_ris_step,
    a.lesson_id,
    coalesce(c.published_at, a.updated_at),
    a.is_attention_point,
    public._ris_step_numeric(a.final_ris_step) = 8,
    a.ready_for_test
  from public.ris_script_assessments a
  join public.ris_lesson_cards c
    on c.id = a.lesson_card_id
   and c.tenant_id = a.tenant_id
  join public.lessons l
    on l.id = a.lesson_id
  where a.tenant_id = p_tenant_id
    and a.student_id = p_student_id
    and c.publication_status::text in (
      'published',
      'published_to_student',
      'waiting_for_student_response',
      'fully_completed'
    )
    and a.final_ris_step is not null
  order by a.script_id, l.starts_at desc, a.updated_at desc;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.progress_recomputed', 'student', p_student_id::text, '{}'::jsonb
  );
end;
$$;
