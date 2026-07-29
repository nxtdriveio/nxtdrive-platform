-- RIS 2.0 corrective model and publication gates.
-- Instruction stage, performance, support, safety and context are persisted
-- separately. Publication is impossible without real expert validation.

-- ---------------------------------------------------------------------------
-- Definition publication guards (cannot be bypassed by direct service writes)
-- ---------------------------------------------------------------------------

create or replace function public._approved_validation_matches(
  p_record_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_content_hash text
) returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.expert_validation_records v
     where v.id = p_record_id
       and v.target_type = p_target_type
       and v.target_id = p_target_id
       and v.content_hash = p_content_hash
       and v.status = 'APPROVED'
       and v.reviewer_user_id is not null
       and v.signed_at is not null
  )
$$;

create or replace function public._guard_readiness_policy_publication()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rules jsonb;
begin
  if new.status = 'PUBLISHED' and old.status <> 'PUBLISHED' then
    if old.status not in ('DRAFT', 'AWAITING_EXPERT_VALIDATION') then
      raise exception 'invalid readiness policy publication status %', old.status;
    end if;
    if new.created_by is null
       or new.reviewed_by is null
       or nullif(trim(coalesce(new.change_note, '')), '') is null then
      raise exception 'readiness policy publication requires complete audit fields';
    end if;
    if not public._approved_validation_matches(
      new.expert_validation_record_id,
      'READINESS_POLICY',
      new.id,
      new.content_hash
    ) then
      raise exception 'readiness policy requires matching real expert approval';
    end if;
    v_rules := coalesce(new.policy_document -> 'competencyRules', '[]'::jsonb);
    if jsonb_typeof(v_rules) <> 'array' or jsonb_array_length(v_rules) = 0 then
      raise exception 'readiness policy requires competency rules';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_rules) rule
       where coalesce((rule ->> 'critical')::boolean, false)
         and coalesce((rule ->> 'compensable')::boolean, false)
    ) then
      raise exception 'critical competencies cannot be compensable';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_rules) rule
       group by rule ->> 'competencyId'
      having count(*) > 1 or nullif(trim(coalesce(rule ->> 'competencyId', '')), '') is null
    ) then
      raise exception 'readiness policy contains duplicate or empty competency ids';
    end if;
    new.published_at := coalesce(new.published_at, timezone('utc', now()));
    if new.published_by is null then
      raise exception 'readiness policy publication requires published_by';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists readiness_policies_publication_guard
  on public.readiness_policies;
create trigger readiness_policies_publication_guard
  before update on public.readiness_policies
  for each row execute function public._guard_readiness_policy_publication();

create or replace function public._guard_assessment_definition_publication()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'PUBLISHED' and old.status <> 'PUBLISHED' then
    if old.status not in ('DRAFT', 'AWAITING_EXPERT_VALIDATION') then
      raise exception 'invalid assessment definition publication status %', old.status;
    end if;
    if new.created_by is null
       or new.reviewed_by is null
       or nullif(trim(coalesce(new.change_note, '')), '') is null
       or jsonb_array_length(new.criteria_document) = 0 then
      raise exception 'assessment definition publication requires audit fields and criteria';
    end if;
    if not public._approved_validation_matches(
      new.expert_validation_record_id,
      'ASSESSMENT_DEFINITION',
      new.id,
      new.content_hash
    ) then
      raise exception 'assessment definition requires matching real expert approval';
    end if;
    new.published_at := coalesce(new.published_at, timezone('utc', now()));
    if new.published_by is null then
      raise exception 'assessment definition publication requires published_by';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_definitions_publication_guard
  on public.assessment_definitions;
create trigger assessment_definitions_publication_guard
  before update on public.assessment_definitions
  for each row execute function public._guard_assessment_definition_publication();

create or replace function public._guard_curriculum_publication()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_module_count integer;
  v_script_count integer;
  v_module_numbers smallint[];
begin
  if new.status = 'PUBLISHED' and old.status <> 'PUBLISHED' then
    if new.training_method = 'RIS_1_0_LEGACY' then
      raise exception 'RIS_1_0_LEGACY curriculum is immutable and cannot be newly published';
    end if;
    if old.status not in ('DRAFT', 'AWAITING_EXPERT_VALIDATION') then
      raise exception 'invalid curriculum publication status %', old.status;
    end if;
    if new.created_by is null
       or new.reviewed_by is null
       or nullif(trim(coalesce(new.change_note, '')), '') is null then
      raise exception 'curriculum publication requires complete audit fields';
    end if;
    if not public._approved_validation_matches(
      new.expert_validation_record_id,
      'CURRICULUM',
      new.id,
      new.content_hash
    ) then
      raise exception 'curriculum requires matching real expert approval';
    end if;
    if not exists (
      select 1 from public.readiness_policies p
       where p.curriculum_version_id = new.id
         and p.status = 'PUBLISHED'
    ) then
      raise exception 'curriculum requires a published readiness policy';
    end if;

    if new.training_method = 'RIS_2_0' then
      select
        count(distinct m.id),
        array_agg(distinct m.module_number order by m.module_number),
        count(distinct s.id)
      into v_module_count, v_module_numbers, v_script_count
      from public.ris_modules m
      left join public.ris_scripts s
        on s.module_id = m.id
       and s.ris_version_id = m.ris_version_id
       and s.is_active
      where m.ris_version_id = new.source_ris_version_id;

      if v_module_count <> 4
         or v_module_numbers <> array[1,2,3,4]::smallint[]
         or v_script_count <> 46 then
        raise exception 'RIS 2.0 publication requires exactly modules 1-4 and 46 active scripts';
      end if;
      if not exists (
        select 1 from public.assessment_definitions d
         where d.curriculum_version_id = new.id
           and d.assessment_type = 'RIS_MODULE_1'
           and d.status = 'PUBLISHED'
      ) or not exists (
        select 1 from public.assessment_definitions d
         where d.curriculum_version_id = new.id
           and d.assessment_type = 'RIS_MODULE_2'
           and d.status = 'PUBLISHED'
      ) then
        raise exception 'RIS 2.0 requires valid published module 1 and module 2 assessment definitions';
      end if;
    elsif new.training_method = 'STANDARD' and not exists (
      select 1 from public.assessment_definitions d
       where d.curriculum_version_id = new.id
         and d.assessment_type = 'STANDARD_PROGRESS_ASSESSMENT'
         and d.status = 'PUBLISHED'
    ) then
      raise exception 'STANDARD curriculum requires a published progress assessment definition';
    end if;

    new.published_at := coalesce(new.published_at, timezone('utc', now()));
    if new.published_by is null then
      raise exception 'curriculum publication requires published_by';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists curriculum_versions_publication_guard
  on public.curriculum_versions;
create trigger curriculum_versions_publication_guard
  before update on public.curriculum_versions
  for each row execute function public._guard_curriculum_publication();

create or replace function public.publish_readiness_policy(
  p_policy_id uuid,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.readiness_policies%rowtype;
begin
  select * into v_policy from public.readiness_policies where id = p_policy_id;
  if v_policy.id is null then
    raise exception 'readiness policy not found';
  end if;
  if not coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = p_actor),
    false
  )
     and (
       v_policy.tenant_id is null
       or not public._tenant_staff_authorized(p_actor, v_policy.tenant_id)
     ) then
    raise exception 'actor not authorized to publish readiness policy';
  end if;
  update public.readiness_policies
     set status = 'PUBLISHED',
         published_by = p_actor,
         published_at = timezone('utc', now())
   where id = p_policy_id;
  return p_policy_id;
end;
$$;

create or replace function public.publish_assessment_definition(
  p_definition_id uuid,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = p_actor),
    false
  ) then
    raise exception 'only platform administrators publish assessment definitions';
  end if;
  update public.assessment_definitions
     set status = 'PUBLISHED',
         published_by = p_actor,
         published_at = timezone('utc', now())
   where id = p_definition_id;
  if not found then
    raise exception 'assessment definition not found';
  end if;
  return p_definition_id;
end;
$$;

create or replace function public.publish_curriculum_version(
  p_curriculum_version_id uuid,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = p_actor),
    false
  ) then
    raise exception 'only platform administrators publish curricula';
  end if;
  update public.curriculum_versions
     set status = 'PUBLISHED',
         published_by = p_actor,
         published_at = timezone('utc', now())
   where id = p_curriculum_version_id;
  if not found then
    raise exception 'curriculum version not found';
  end if;
  return p_curriculum_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Separate RIS observation dimensions and canonical write adapter
-- ---------------------------------------------------------------------------

alter table public.ris_lesson_cards
  add column if not exists training_enrollment_id uuid
    references public.training_enrollments(id) on delete restrict;

alter table public.ris_script_assessments
  add column if not exists concept_performance_outcome text,
  add column if not exists final_performance_outcome text,
  add column if not exists concept_support_level text,
  add column if not exists final_support_level text,
  add column if not exists concept_safety_status text,
  add column if not exists final_safety_status text,
  add column if not exists concept_context_tags text[] not null default '{}',
  add column if not exists final_context_tags text[] not null default '{}';

alter table public.ris_script_assessments
  drop constraint if exists ris_script_assessments_concept_performance_check,
  add constraint ris_script_assessments_concept_performance_check
    check (
      concept_performance_outcome is null
      or concept_performance_outcome in (
        'NOT_OBSERVED', 'ATTENTION_REQUIRED', 'DEVELOPING', 'SUFFICIENT', 'STABLE'
      )
    ),
  drop constraint if exists ris_script_assessments_final_performance_check,
  add constraint ris_script_assessments_final_performance_check
    check (
      final_performance_outcome is null
      or final_performance_outcome in (
        'NOT_OBSERVED', 'ATTENTION_REQUIRED', 'DEVELOPING', 'SUFFICIENT', 'STABLE'
      )
    ),
  drop constraint if exists ris_script_assessments_concept_support_check,
  add constraint ris_script_assessments_concept_support_check
    check (
      concept_support_level is null
      or concept_support_level in (
        'DIRECT_INSTRUCTION', 'PROMPTING', 'COACHING', 'OBSERVATION_ONLY'
      )
    ),
  drop constraint if exists ris_script_assessments_final_support_check,
  add constraint ris_script_assessments_final_support_check
    check (
      final_support_level is null
      or final_support_level in (
        'DIRECT_INSTRUCTION', 'PROMPTING', 'COACHING', 'OBSERVATION_ONLY'
      )
    ),
  drop constraint if exists ris_script_assessments_concept_safety_check,
  add constraint ris_script_assessments_concept_safety_check
    check (
      concept_safety_status is null
      or concept_safety_status in ('NOT_ASSESSED', 'NO_BLOCKER', 'ATTENTION', 'BLOCKER')
    ),
  drop constraint if exists ris_script_assessments_final_safety_check,
  add constraint ris_script_assessments_final_safety_check
    check (
      final_safety_status is null
      or final_safety_status in ('NOT_ASSESSED', 'NO_BLOCKER', 'ATTENTION', 'BLOCKER')
    );

comment on column public.ris_script_assessments.concept_ris_step is
  'Draft didactic RIS instruction stage N/1-8; never a performance or readiness score.';
comment on column public.ris_script_assessments.final_ris_step is
  'Published didactic RIS instruction stage N/1-8; never averaged into readiness.';
comment on column public.ris_script_assessments.concept_performance_outcome is
  'Separate explicit performance observation; never inferred from instruction stage.';
comment on column public.ris_script_assessments.concept_safety_status is
  'Separate explicit safety observation. NOT_ASSESSED is not equivalent to clear.';

create or replace function public._attach_ris_training_enrollment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_enrollment public.training_enrollments%rowtype;
begin
  if new.training_enrollment_id is null then
    select * into v_enrollment
      from public.training_enrollments
     where tenant_id = new.tenant_id
       and student_id = new.student_id
       and training_method = 'RIS_2_0'
       and status = 'ACTIVE'
     order by created_at desc
     limit 1;
    new.training_enrollment_id := v_enrollment.id;
  end if;
  if new.training_enrollment_id is not null then
    select e.* into v_enrollment
      from public.training_enrollments e
     where e.id = new.training_enrollment_id
       and e.tenant_id = new.tenant_id
       and e.student_id = new.student_id;
    if v_enrollment.id is null
       or v_enrollment.training_method <> 'RIS_2_0'
       or v_enrollment.status <> 'ACTIVE' then
      raise exception 'RIS lesson cards require an active RIS_2_0 enrollment';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ris_lesson_cards_training_enrollment
  on public.ris_lesson_cards;
create trigger ris_lesson_cards_training_enrollment
  before insert or update of training_enrollment_id, student_id
  on public.ris_lesson_cards
  for each row execute function public._attach_ris_training_enrollment();

create or replace function public._copy_ris_observation_dimensions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.final_ris_step is distinct from old.final_ris_step
     and new.final_ris_step is not null then
    new.final_performance_outcome := new.concept_performance_outcome;
    new.final_support_level := new.concept_support_level;
    new.final_safety_status := new.concept_safety_status;
    new.final_context_tags := new.concept_context_tags;
  end if;
  return new;
end;
$$;

drop trigger if exists ris_script_assessments_copy_dimensions
  on public.ris_script_assessments;
create trigger ris_script_assessments_copy_dimensions
  before update of final_ris_step on public.ris_script_assessments
  for each row execute function public._copy_ris_observation_dimensions();

create or replace function public.set_ris_concept_observation_v2(
  p_tenant_id uuid,
  p_lesson_id uuid,
  p_actor uuid,
  p_script_id uuid,
  p_script_variant_id uuid,
  p_concept_ris_step text,
  p_performance_outcome text,
  p_support_level text,
  p_safety_status text,
  p_context_tags text[],
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
  v_assessment_id uuid;
  v_context_tags text[];
begin
  if p_performance_outcome not in (
    'NOT_OBSERVED', 'ATTENTION_REQUIRED', 'DEVELOPING', 'SUFFICIENT', 'STABLE'
  ) then
    raise exception 'invalid RIS performance outcome';
  end if;
  if p_support_level not in (
    'DIRECT_INSTRUCTION', 'PROMPTING', 'COACHING', 'OBSERVATION_ONLY'
  ) then
    raise exception 'invalid RIS support level';
  end if;
  if p_safety_status not in (
    'NOT_ASSESSED', 'NO_BLOCKER', 'ATTENTION', 'BLOCKER'
  ) then
    raise exception 'invalid RIS safety status';
  end if;
  if (p_concept_ris_step is null or p_concept_ris_step = 'N')
     and p_performance_outcome = 'NOT_OBSERVED'
     and p_safety_status <> 'NOT_ASSESSED' then
    raise exception 'unobserved RIS evidence cannot assert a safety outcome';
  end if;

  v_assessment_id := public.set_ris_concept_score(
    p_tenant_id,
    p_lesson_id,
    p_actor,
    p_script_id,
    p_script_variant_id,
    p_concept_ris_step,
    p_status,
    p_is_attention_point,
    p_is_featured_for_lesson,
    p_should_repeat,
    false, -- deprecated ready_for_test cannot be a blocker override
    p_instructor_note,
    p_student_visible_note
  );

  select coalesce(array_agg(tag order by tag), '{}')
    into v_context_tags
    from (
      select distinct trim(raw_tag) as tag
        from unnest(coalesce(p_context_tags, '{}')) raw_tag
       where nullif(trim(raw_tag), '') is not null
    ) normalized_tags;

  update public.ris_script_assessments
     set concept_performance_outcome = p_performance_outcome,
         concept_support_level = p_support_level,
         concept_safety_status = p_safety_status,
         concept_context_tags = v_context_tags,
         ready_for_test = false
   where id = v_assessment_id
     and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'ris.concept_observation_set',
    'ris_script_assessment', v_assessment_id::text,
    jsonb_build_object(
      'lesson_id', p_lesson_id,
      'script_id', p_script_id,
      'instruction_stage', p_concept_ris_step,
      'performance_outcome', p_performance_outcome,
      'support_level', p_support_level,
      'safety_status', p_safety_status,
      'context_tags', v_context_tags
    )
  );
  return v_assessment_id;
end;
$$;

-- Existing ready_for_module_test is retained only for old reads. It cannot be
-- written true after this migration and cannot influence a new decision.
create or replace function public._retire_ris_ready_booleans()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ready_for_test := false;
  return new;
end;
$$;

drop trigger if exists ris_script_assessments_retire_ready_boolean
  on public.ris_script_assessments;
create trigger ris_script_assessments_retire_ready_boolean
  before insert or update of ready_for_test on public.ris_script_assessments
  for each row execute function public._retire_ris_ready_booleans();

update public.student_ris_progress
   set ready_for_module_test = false
 where ready_for_module_test;

create or replace function public._retire_student_ris_ready_boolean()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ready_for_module_test := false;
  return new;
end;
$$;

drop trigger if exists student_ris_progress_retire_ready_boolean
  on public.student_ris_progress;
create trigger student_ris_progress_retire_ready_boolean
  before insert or update of ready_for_module_test on public.student_ris_progress
  for each row execute function public._retire_student_ris_ready_boolean();

-- ---------------------------------------------------------------------------
-- Lesson publication guard: active RIS 2.0, validated immutable definitions,
-- complete separated observations and reflection.
-- ---------------------------------------------------------------------------

create or replace function public._guard_ris_lesson_publication_canon()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_enrollment public.training_enrollments%rowtype;
  v_curriculum public.curriculum_versions%rowtype;
begin
  if new.publication_status in (
    'published',
    'published_to_student',
    'waiting_for_student_response',
    'fully_completed'
  ) and old.publication_status not in (
    'published',
    'published_to_student',
    'waiting_for_student_response',
    'fully_completed'
  ) then
    select * into v_enrollment
      from public.training_enrollments
     where id = new.training_enrollment_id
       and tenant_id = new.tenant_id
       and student_id = new.student_id;
    if v_enrollment.id is null
       or v_enrollment.training_method <> 'RIS_2_0'
       or v_enrollment.status <> 'ACTIVE' then
      raise exception 'publication requires an active RIS_2_0 enrollment';
    end if;
    select * into v_curriculum
      from public.curriculum_versions
     where id = v_enrollment.curriculum_version_id
       and source_ris_version_id = new.ris_version_id;
    if v_curriculum.id is null or v_curriculum.status <> 'PUBLISHED' then
      raise exception 'RIS lesson publication requires the matching published curriculum';
    end if;
    if not public._approved_validation_matches(
      v_curriculum.expert_validation_record_id,
      'CURRICULUM',
      v_curriculum.id,
      v_curriculum.content_hash
    ) then
      raise exception 'RIS lesson publication requires current expert validation';
    end if;
    if not exists (
      select 1 from public.readiness_policies p
       where p.curriculum_version_id = v_curriculum.id
         and p.status = 'PUBLISHED'
         and (p.tenant_id is null or p.tenant_id = new.tenant_id)
    ) then
      raise exception 'RIS lesson publication requires a published readiness policy';
    end if;
    if not exists (
      select 1
        from public.ris_script_assessments a
       where a.lesson_card_id = new.id
         and a.tenant_id = new.tenant_id
         and (
           public._ris_step_numeric(a.final_ris_step) is not null
           or a.final_performance_outcome <> 'NOT_OBSERVED'
         )
         and a.final_performance_outcome is not null
         and a.final_support_level is not null
         and a.final_safety_status is not null
    ) then
      raise exception 'RIS lesson publication requires separated stage, performance, support and safety evidence';
    end if;
    if exists (
      select 1
        from public.ris_script_assessments a
       where a.lesson_card_id = new.id
         and a.tenant_id = new.tenant_id
         and a.final_ris_step is not null
         and (
           a.final_performance_outcome is null
           or a.final_support_level is null
           or a.final_safety_status is null
         )
    ) then
      raise exception 'RIS lesson publication contains incomplete normalized observations';
    end if;
    if not exists (
      select 1
        from public.ris_guided_reflections r
       where r.lesson_card_id = new.id
         and r.tenant_id = new.tenant_id
         and nullif(trim(coalesce(r.one_sentence_reflection, '')), '') is not null
    ) then
      raise exception 'RIS lesson publication requires guided reflection';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ris_lesson_cards_canon_publication_guard
  on public.ris_lesson_cards;
create trigger ris_lesson_cards_canon_publication_guard
  before update of publication_status on public.ris_lesson_cards
  for each row execute function public._guard_ris_lesson_publication_canon();

grant execute on function public.set_ris_concept_observation_v2(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text[],
  public.ris_script_status, boolean, boolean, boolean, boolean, text, text
) to service_role;
revoke execute on function public.set_ris_concept_observation_v2(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text[],
  public.ris_script_status, boolean, boolean, boolean, boolean, text, text
) from public, anon, authenticated;

grant execute on function public.publish_readiness_policy(uuid, uuid)
  to service_role;
revoke execute on function public.publish_readiness_policy(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_assessment_definition(uuid, uuid)
  to service_role;
revoke execute on function public.publish_assessment_definition(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_curriculum_version(uuid, uuid)
  to service_role;
revoke execute on function public.publish_curriculum_version(uuid, uuid)
  from public, anon, authenticated;

comment on function public._guard_curriculum_publication() is
  'Behavioral RIS catalog publication guard: completeness, audit, expert hash, one active version, readiness policy and assessment definitions.';
comment on function public._guard_ris_lesson_publication_canon() is
  'Behavioral lesson publication guard: active RIS_2_0 only, expert-approved immutable definitions and separated normalized evidence.';
