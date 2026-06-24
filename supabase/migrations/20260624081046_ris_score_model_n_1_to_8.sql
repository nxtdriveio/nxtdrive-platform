-- Corrective RIS score model migration.
-- Canonical model: `N` means not assessed; numeric RIS scores run from 1..8.
-- Older null values remain accepted and are displayed as `N` in the app.

update public.ris_script_assessments
   set previous_ris_step = '8'
 where previous_ris_step in ('9', '10');

update public.ris_script_assessments
   set concept_ris_step = '8'
 where concept_ris_step in ('9', '10');

update public.ris_script_assessments
   set final_ris_step = '8'
 where final_ris_step in ('9', '10');

update public.student_ris_progress
   set current_final_step = '8'
 where current_final_step in ('9', '10');

create or replace function public._ris_step_numeric(p_step text)
returns smallint
language sql
immutable
as $$
  select case
    when p_step is null or p_step = 'N' then null
    when p_step ~ '^[1-8]$' then p_step::smallint
    else null
  end
$$;

create or replace function public._ris_step_valid(p_step text)
returns boolean
language sql
immutable
as $$
  select p_step is null or p_step = 'N' or p_step ~ '^[1-8]$'
$$;

delete from public.ris_step_definitions
 where step_value in ('9', '10');

insert into public.ris_step_definitions (
  ris_version_id, step_value, instructor_label, student_label, explanation, phase, sort_order
)
select
  v.id,
  d.step_value,
  d.instructor_label,
  d.student_label,
  d.explanation,
  d.phase,
  d.sort_order
from public.ris_versions v
cross join (values
  ('N', 'Niet beoordeeld', 'Nog niet beoordeeld', 'Er is nog geen betrouwbare beoordeling vastgelegd.', 'geen score', 0),
  ('1', 'Startniveau', 'Je maakt kennis met dit onderdeel', 'De leerling herkent het onderdeel, maar voert het nog niet betrouwbaar uit.', 'cognitief', 10),
  ('2', 'Met veel hulp', 'Je oefent dit met veel hulp', 'De leerling voert het onderdeel alleen uit met voortdurende aanwijzingen.', 'cognitief', 20),
  ('3', 'Met hulp', 'Je voert dit met hulp uit', 'De leerling begrijpt de opdracht en voert uit met duidelijke begeleiding.', 'cognitief', 30),
  ('4', 'Onder begeleiding', 'Je doet dit al deels zelf', 'De leerling voert delen zelfstandig uit, maar correctie blijft nodig.', 'associatief', 40),
  ('5', 'Redelijk zelfstandig', 'Je rijdt dit redelijk zelfstandig', 'De leerling voert de basis meestal zelfstandig uit met beperkte aanwijzingen.', 'associatief', 50),
  ('6', 'Voldoende', 'Je kunt dit zelfstandig uitvoeren', 'De leerling voert het onderdeel zelfstandig, veilig en voldoende stabiel uit.', 'associatief', 60),
  ('7', 'Goed', 'Je past dit goed toe', 'De leerling past het onderdeel goed toe in verschillende situaties.', 'geautomatiseerd', 70),
  ('8', 'Examenwaardig', 'Je beheerst dit examenwaardig', 'De leerling voert het onderdeel zelfstandig, veilig en examenwaardig uit.', 'geautomatiseerd', 80)
) as d(step_value, instructor_label, student_label, explanation, phase, sort_order)
on conflict (ris_version_id, step_value) do update
  set instructor_label = excluded.instructor_label,
      student_label = excluded.student_label,
      explanation = excluded.explanation,
      phase = excluded.phase,
      sort_order = excluded.sort_order;

update public.ris_versions
   set description = regexp_replace(
         coalesce(description, 'Digitale RIS-leskaart voor Rijbewijs B.'),
         ('1-' || '10|1-8') || ' scoremodel',
         'N/1-8 scoremodel',
         'gi'
       )
 where description is null
    or description ~* (('1-' || '10|1-8') || ' scoremodel');

create or replace function public._insert_default_ris_taxonomy()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
begin
  insert into public.ris_versions (name, description, active_from, is_active)
  values (
    'RIS 2.0 - Rijbewijs B',
    'Digitale RIS-leskaart voor Rijbewijs B: 4 modules, 46 scripts en N/1-8 scoremodel.',
    date '2026-01-01',
    true
  )
  on conflict (name) do update
    set description = excluded.description,
        is_active = true
  returning id into v_version_id;

  delete from public.ris_step_definitions
   where ris_version_id = v_version_id
     and step_value in ('9', '10');

  insert into public.ris_step_definitions (
    ris_version_id, step_value, instructor_label, student_label, explanation, phase, sort_order
  )
  select
    v_version_id,
    d.step_value,
    d.instructor_label,
    d.student_label,
    d.explanation,
    d.phase,
    d.sort_order
  from (values
    ('N', 'Niet beoordeeld', 'Nog niet beoordeeld', 'Er is nog geen betrouwbare beoordeling vastgelegd.', 'geen score', 0),
    ('1', 'Startniveau', 'Je maakt kennis met dit onderdeel', 'De leerling herkent het onderdeel, maar voert het nog niet betrouwbaar uit.', 'cognitief', 10),
    ('2', 'Met veel hulp', 'Je oefent dit met veel hulp', 'De leerling voert het onderdeel alleen uit met voortdurende aanwijzingen.', 'cognitief', 20),
    ('3', 'Met hulp', 'Je voert dit met hulp uit', 'De leerling begrijpt de opdracht en voert uit met duidelijke begeleiding.', 'cognitief', 30),
    ('4', 'Onder begeleiding', 'Je doet dit al deels zelf', 'De leerling voert delen zelfstandig uit, maar correctie blijft nodig.', 'associatief', 40),
    ('5', 'Redelijk zelfstandig', 'Je rijdt dit redelijk zelfstandig', 'De leerling voert de basis meestal zelfstandig uit met beperkte aanwijzingen.', 'associatief', 50),
    ('6', 'Voldoende', 'Je kunt dit zelfstandig uitvoeren', 'De leerling voert het onderdeel zelfstandig, veilig en voldoende stabiel uit.', 'associatief', 60),
    ('7', 'Goed', 'Je past dit goed toe', 'De leerling past het onderdeel goed toe in verschillende situaties.', 'geautomatiseerd', 70),
    ('8', 'Examenwaardig', 'Je beheerst dit examenwaardig', 'De leerling voert het onderdeel zelfstandig, veilig en examenwaardig uit.', 'geautomatiseerd', 80)
  ) as d(step_value, instructor_label, student_label, explanation, phase, sort_order)
  on conflict (ris_version_id, step_value) do update
    set instructor_label = excluded.instructor_label,
        student_label = excluded.student_label,
        explanation = excluded.explanation,
        phase = excluded.phase,
        sort_order = excluded.sort_order;

  return v_version_id;
end;
$$;

create or replace function public.seed_default_ris_taxonomy()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._insert_default_ris_taxonomy();
end;
$$;

comment on function public._ris_step_valid(text) is
  'Canonical RIS score validator. Accepts null, N, or text scores 1 through 8; null and N mean not assessed.';
comment on function public._ris_step_numeric(text) is
  'Converts canonical RIS text scores 1 through 8 to numeric values; null and N remain unassessed.';
comment on column public.ris_script_assessments.previous_ris_step is
  'Previous published RIS score, stored as N or text 1 through 8. Null means not assessed yet.';
comment on column public.ris_script_assessments.concept_ris_step is
  'Draft RIS score, stored as N or text 1 through 8. Null means not assessed yet.';
comment on column public.ris_script_assessments.final_ris_step is
  'Published RIS score, stored as N or text 1 through 8. Null means not assessed yet.';
comment on column public.student_ris_progress.current_final_step is
  'Latest published RIS score, stored as N or text 1 through 8. Null means not assessed yet.';

-- Keep the older lesson-skill/progress layer aligned with the canonical
-- N/1-8 score model as long as those tables still feed dashboards, exports and
-- parent/student views. `lessons.progress_score = null` is the overall lesson
-- equivalent of N.
update public.lesson_skill_scores
   set score = 8
 where score > 8;

update public.student_skill_scores
   set score = 8
 where score > 8;

update public.lessons
   set progress_score = null
 where progress_score is not null
   and progress_score < 1;

update public.lessons
   set progress_score = 8
 where progress_score > 8;

alter table public.lesson_skill_scores
  drop constraint if exists lesson_skill_scores_score_check,
  drop constraint if exists lesson_skill_scores_score_range;

alter table public.lesson_skill_scores
  add constraint lesson_skill_scores_score_range
  check (score between 1 and 8);

alter table public.student_skill_scores
  drop constraint if exists student_skill_scores_score_check,
  drop constraint if exists student_skill_scores_score_range;

alter table public.student_skill_scores
  add constraint student_skill_scores_score_range
  check (score between 1 and 8);

alter table public.lessons
  drop constraint if exists lessons_progress_score_range;

alter table public.lessons
  add constraint lessons_progress_score_range
  check (progress_score is null or progress_score between 1 and 8);

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
  if p_score is not null and (p_score < 1 or p_score > 8) then
    raise exception 'progress score must be N/null or between 1 and 8';
  end if;

  select status into v_status
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_status is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_status not in ('planned', 'in_progress', 'completed') then
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

create or replace function public.set_skill_score(
  p_lesson_id  uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_student_id uuid,
  p_skill_id   uuid,
  p_score      smallint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson_student uuid;
  v_level          smallint;
  v_active         boolean;
  v_roll_score     smallint;
  v_roll_lesson    uuid;
  v_roll_by        uuid;
  v_roll_at        timestamptz;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_score is null or p_score < 1 or p_score > 8 then
    raise exception 'skill score must be between 1 and 8';
  end if;

  select student_id into v_lesson_student
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id;
  if v_lesson_student is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_lesson_student <> p_student_id then
    raise exception 'lesson % does not belong to student %', p_lesson_id, p_student_id;
  end if;

  select level, active into v_level, v_active
    from public.skill_taxonomy
   where id = p_skill_id and tenant_id = p_tenant_id;
  if v_level is null then
    raise exception 'skill % not found in tenant %', p_skill_id, p_tenant_id;
  end if;
  if v_level <> 3 then
    raise exception 'skill % is not a gradable leaf (level=%)', p_skill_id, v_level;
  end if;
  if v_active is not true then
    raise exception 'skill % is not active', p_skill_id;
  end if;

  insert into public.lesson_skill_scores (
    lesson_id, tenant_id, student_id, skill_id, score, scored_by
  ) values (
    p_lesson_id, p_tenant_id, p_student_id, p_skill_id, p_score, p_actor
  )
  on conflict (lesson_id, skill_id) do update
    set score      = excluded.score,
        scored_by  = excluded.scored_by,
        updated_at = now();

  select lss.score, lss.lesson_id, lss.scored_by, l.starts_at
    into v_roll_score, v_roll_lesson, v_roll_by, v_roll_at
    from public.lesson_skill_scores lss
    join public.lessons l on l.id = lss.lesson_id
   where lss.tenant_id  = p_tenant_id
     and lss.student_id = p_student_id
     and lss.skill_id   = p_skill_id
   order by l.starts_at desc, lss.updated_at desc
   limit 1;

  insert into public.student_skill_scores (
    student_id, tenant_id, skill_id, score, last_lesson_id, scored_at, scored_by
  ) values (
    p_student_id, p_tenant_id, p_skill_id, v_roll_score, v_roll_lesson, v_roll_at, v_roll_by
  )
  on conflict (student_id, skill_id) do update
    set score          = excluded.score,
        last_lesson_id = excluded.last_lesson_id,
        scored_at      = excluded.scored_at,
        scored_by      = excluded.scored_by,
        updated_at     = now();

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'skill.score_set', 'student', p_student_id::text,
    jsonb_build_object('lesson_id', p_lesson_id, 'skill_id', p_skill_id, 'score', p_score)
  );
end;
$$;

revoke all on function public.set_skill_score(uuid, uuid, uuid, uuid, uuid, smallint) from public;
revoke execute on function public.set_skill_score(uuid, uuid, uuid, uuid, uuid, smallint) from anon, authenticated;
grant execute on function public.set_skill_score(uuid, uuid, uuid, uuid, uuid, smallint) to service_role;

comment on column public.lessons.progress_score is
  'Overall lesson score on the canonical N/1-8 model. Null means N/not assessed.';
comment on column public.lesson_skill_scores.score is
  'Per-lesson skill score on the canonical 1 through 8 scale.';
comment on column public.student_skill_scores.score is
  'Latest skill score on the canonical 1 through 8 scale.';
