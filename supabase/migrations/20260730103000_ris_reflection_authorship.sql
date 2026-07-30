-- Make the origin of learner reflection explicit and auditable.
-- Existing guided reflections were captured through a staff-authenticated
-- surface and are therefore conservatively classified as instructor-assisted.

alter table public.ris_guided_reflections
  add column if not exists entry_mode text not null default 'instructor_assisted',
  add column if not exists entered_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists captured_surface text not null default 'instructor_app';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ris_guided_reflections_entry_mode_check'
       and conrelid = 'public.ris_guided_reflections'::regclass
  ) then
    alter table public.ris_guided_reflections
      add constraint ris_guided_reflections_entry_mode_check
      check (entry_mode in ('student_self', 'instructor_assisted'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'ris_guided_reflections_captured_surface_check'
       and conrelid = 'public.ris_guided_reflections'::regclass
  ) then
    alter table public.ris_guided_reflections
      add constraint ris_guided_reflections_captured_surface_check
      check (captured_surface in ('instructor_app', 'student_app'));
  end if;
end;
$$;

update public.ris_guided_reflections
   set entered_by_user_id = coalesce(entered_by_user_id, captured_by, instructor_id),
       entry_mode = coalesce(nullif(entry_mode, ''), 'instructor_assisted'),
       captured_surface = coalesce(nullif(captured_surface, ''), 'instructor_app')
 where entered_by_user_id is null
    or entry_mode is null
    or captured_surface is null;

create or replace function public.set_ris_guided_reflection_v3(
  p_lesson_card_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_student_present boolean,
  p_entry_mode text,
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
  if p_entry_mode not in ('student_self', 'instructor_assisted') then
    raise exception 'invalid reflection entry mode %', p_entry_mode;
  end if;
  if p_entry_mode = 'student_self' and not coalesce(p_student_present, false) then
    raise exception 'student-authored reflection requires the student to be present';
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
    student_present, entry_mode, entered_by_user_id, captured_surface,
    rating_overall, rating_independence, overall_rating, independence_rating,
    insight_rating, confidence_rating, went_well_text, difficult_text,
    next_lesson_wish, one_sentence_reflection, instructor_context_note, captured_at
  ) values (
    p_lesson_card_id, p_tenant_id, v_card.lesson_id, v_card.student_id, p_actor, p_actor,
    coalesce(p_student_present, true), p_entry_mode, p_actor, 'instructor_app',
    public._ris_rating_number(p_overall_rating),
    public._ris_rating_number(p_independence_rating), p_overall_rating,
    p_independence_rating, p_insight_rating, p_confidence_rating, null, null, null,
    nullif(trim(coalesce(p_one_sentence_reflection, '')), ''),
    nullif(trim(coalesce(p_instructor_context_note, '')), ''), now()
  )
  on conflict (lesson_card_id) do update
    set captured_by = p_actor,
        instructor_id = p_actor,
        student_present = coalesce(p_student_present, true),
        entry_mode = p_entry_mode,
        entered_by_user_id = p_actor,
        captured_surface = 'instructor_app',
        rating_overall = public._ris_rating_number(p_overall_rating),
        rating_independence = public._ris_rating_number(p_independence_rating),
        overall_rating = p_overall_rating,
        independence_rating = p_independence_rating,
        insight_rating = p_insight_rating,
        confidence_rating = p_confidence_rating,
        one_sentence_reflection = nullif(trim(coalesce(p_one_sentence_reflection, '')), ''),
        instructor_context_note = nullif(trim(coalesce(p_instructor_context_note, '')), ''),
        captured_at = now();

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'ris.guided_reflection_set',
    'ris_lesson_card', p_lesson_card_id::text,
    jsonb_build_object(
      'lesson_id', v_card.lesson_id,
      'student_id', v_card.student_id,
      'student_present', coalesce(p_student_present, true),
      'entry_mode', p_entry_mode,
      'captured_surface', 'instructor_app'
    )
  );
end;
$$;

revoke all on function public.set_ris_guided_reflection_v3(
  uuid, uuid, uuid, boolean, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.set_ris_guided_reflection_v3(
  uuid, uuid, uuid, boolean, text, text, text, text, text, text, text
) to service_role;

comment on column public.ris_guided_reflections.entry_mode is
  'student_self means the learner authored the words; instructor_assisted means staff helped formulate or enter them.';
