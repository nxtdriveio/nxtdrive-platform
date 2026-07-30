-- Operational expert-review workspaces for RIS readiness policy, module-test
-- definitions and final curriculum publication.

create or replace function public._ris_platform_admin_authorized(
  p_actor uuid
) returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select profile.is_platform_admin
       from public.profiles profile
      where profile.id = p_actor),
    false
  )
$$;

create or replace function public._ris_definition_content_hash(
  p_document jsonb
) returns text
language sql
immutable
set search_path = public
as $$
  select encode(
    extensions.digest(convert_to(p_document::text, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

create or replace function public._ris_review_scenarios_pass(
  p_scenario_results jsonb,
  p_required_keys text[]
) returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_scenario_results, '[]'::jsonb)) = 'array'
     and not exists (
       select 1
         from unnest(coalesce(p_required_keys, '{}'::text[])) required_key
        where not exists (
          select 1
            from jsonb_array_elements(coalesce(p_scenario_results, '[]'::jsonb)) result
           where result ->> 'key' = required_key
             and coalesce((result ->> 'passed')::boolean, false)
        )
     )
$$;

create or replace function public._record_ris_definition_review(
  p_target_type text,
  p_target_id uuid,
  p_content_hash text,
  p_actor uuid,
  p_decision text,
  p_reviewer_credentials text,
  p_scenario_results jsonb,
  p_limitation_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.expert_validation_records%rowtype;
  v_decision text := upper(trim(coalesce(p_decision, '')));
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators may record RIS definition reviews';
  end if;
  if p_target_type not in ('READINESS_POLICY', 'ASSESSMENT_DEFINITION') then
    raise exception 'unsupported RIS definition review target';
  end if;
  if v_decision not in ('IN_REVIEW', 'CHANGES_REQUIRED', 'APPROVED') then
    raise exception 'invalid RIS definition review decision';
  end if;
  if jsonb_typeof(coalesce(p_scenario_results, '[]'::jsonb)) <> 'array' then
    raise exception 'scenario results must be an array';
  end if;
  if v_decision = 'APPROVED'
     and nullif(trim(coalesce(p_reviewer_credentials, '')), '') is null then
    raise exception 'expert credentials are required for approval';
  end if;
  if v_decision = 'CHANGES_REQUIRED'
     and nullif(trim(coalesce(p_limitation_note, '')), '') is null then
    raise exception 'describe the required changes';
  end if;

  select *
    into v_record
    from public.expert_validation_records
   where target_type = p_target_type
     and target_id = p_target_id
     and content_hash = p_content_hash
   for update;

  if v_record.id is null then
    insert into public.expert_validation_records (
      tenant_id,
      target_type,
      target_id,
      status,
      content_hash,
      reviewer_user_id,
      reviewer_credentials,
      scenario_results,
      limitation_note,
      signed_at,
      created_by
    ) values (
      null,
      p_target_type,
      p_target_id,
      v_decision,
      p_content_hash,
      case when v_decision = 'IN_REVIEW' then null else p_actor end,
      nullif(trim(coalesce(p_reviewer_credentials, '')), ''),
      coalesce(p_scenario_results, '[]'::jsonb),
      nullif(trim(coalesce(p_limitation_note, '')), ''),
      case
        when v_decision = 'APPROVED' then timezone('utc', now())
        else null
      end,
      p_actor
    )
    returning * into v_record;
  elsif v_record.status <> 'APPROVED' then
    update public.expert_validation_records
       set status = v_decision,
           reviewer_user_id = case
             when v_decision = 'IN_REVIEW' then reviewer_user_id
             else p_actor
           end,
           reviewer_credentials = nullif(
             trim(coalesce(p_reviewer_credentials, '')),
             ''
           ),
           scenario_results = coalesce(p_scenario_results, '[]'::jsonb),
           limitation_note = nullif(
             trim(coalesce(p_limitation_note, '')),
             ''
           ),
           signed_at = case
             when v_decision = 'APPROVED' then timezone('utc', now())
             else null
           end
     where id = v_record.id
     returning * into v_record;
  end if;

  return v_record.id;
end;
$$;

create or replace function public.configure_ris_readiness_policy(
  p_curriculum_version_id uuid,
  p_actor uuid,
  p_critical_competency_ids text[],
  p_minimum_evidence_count integer,
  p_minimum_context_count integer,
  p_stability_window integer,
  p_minimum_stable_observations integer,
  p_maximum_evidence_age_days integer,
  p_change_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curriculum public.curriculum_versions%rowtype;
  v_policy public.readiness_policies%rowtype;
  v_document jsonb;
  v_hash text;
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators may configure RIS readiness policy';
  end if;
  select *
    into v_curriculum
    from public.curriculum_versions
   where id = p_curriculum_version_id
   for update;
  if v_curriculum.id is null
     or v_curriculum.training_method <> 'RIS_2_0'
     or v_curriculum.source_ris_version_id is null then
    raise exception 'RIS 2.0 curriculum not found';
  end if;
  if v_curriculum.status in ('PUBLISHED', 'RETIRED') then
    raise exception 'published curriculum policy is immutable; create a new curriculum version';
  end if;
  if p_minimum_evidence_count not between 1 and 20
     or p_minimum_context_count not between 1 and 20
     or p_stability_window not between 1 and 20
     or p_minimum_stable_observations not between 1 and p_stability_window
     or p_maximum_evidence_age_days not between 1 and 365 then
    raise exception 'invalid readiness coverage or stability values';
  end if;
  if exists (
    select 1
      from unnest(coalesce(p_critical_competency_ids, '{}'::text[])) critical_id
     where not exists (
       select 1
         from public.ris_scripts script
        where script.ris_version_id = v_curriculum.source_ris_version_id
          and script.is_active
          and script.code = critical_id
     )
  ) then
    raise exception 'critical competency does not belong to the selected RIS catalog';
  end if;

  select jsonb_build_object(
    'schemaVersion', 'readiness-policy.v1',
    'trainingMethod', 'RIS_2_0',
    'engineVersion', '2.0.0',
    'competencyRules', coalesce(jsonb_agg(
      jsonb_build_object(
        'competencyId', script.code,
        'label', script.title,
        'moduleNumber', module.module_number,
        'critical', script.code = any(coalesce(p_critical_competency_ids, '{}'::text[])),
        'requiredCompetenceBand', 'SUFFICIENT',
        'requiredIndependenceBand', 'INDEPENDENT',
        'minimumEvidenceCount', p_minimum_evidence_count,
        'minimumContextCount', p_minimum_context_count,
        'maximumEvidenceAgeDays', p_maximum_evidence_age_days,
        'stabilityWindow', p_stability_window,
        'minimumStableObservations', p_minimum_stable_observations,
        'requireSafetyClear', true,
        'compensable', false
      )
      order by module.module_number, script.sort_order, script.script_number
    ), '[]'::jsonb),
    'prerequisiteRules', jsonb_build_array(
      jsonb_build_object(
        'id', 'THEORY_PASSED',
        'label', 'Theorie behaald',
        'required', true,
        'blockReview', true
      ),
      jsonb_build_object(
        'id', 'HEALTH_DECLARATION',
        'label', 'Gezondheidsverklaring geregeld',
        'required', true,
        'blockReview', true
      ),
      jsonb_build_object(
        'id', 'CBR_AUTHORIZATION',
        'label', 'CBR-machtiging ontvangen',
        'required', true,
        'blockReview', true
      )
    ),
    'assessmentRules', jsonb_build_array(
      jsonb_build_object(
        'assessmentType', 'RIS_MODULE_1',
        'required', true,
        'requiredResult', 'PASSED',
        'blockReview', true
      ),
      jsonb_build_object(
        'assessmentType', 'RIS_MODULE_2',
        'required', true,
        'requiredResult', 'PASSED',
        'blockReview', true
      )
    )
  )
    into v_document
    from public.ris_scripts script
    join public.ris_modules module
      on module.id = script.module_id
     and module.ris_version_id = script.ris_version_id
   where script.ris_version_id = v_curriculum.source_ris_version_id
     and script.is_active;

  if jsonb_array_length(v_document -> 'competencyRules') <> 46 then
    raise exception 'RIS readiness policy requires exactly 46 active script rules';
  end if;
  v_hash := public._ris_definition_content_hash(v_document);

  select *
    into v_policy
    from public.readiness_policies
   where curriculum_version_id = p_curriculum_version_id
     and tenant_id is null
     and status in ('DRAFT', 'AWAITING_EXPERT_VALIDATION')
   order by created_at desc
   limit 1
   for update;

  if v_policy.id is null then
    insert into public.readiness_policies (
      curriculum_version_id,
      tenant_id,
      version_code,
      engine_version,
      status,
      policy_document,
      content_hash,
      created_by,
      change_note
    ) values (
      p_curriculum_version_id,
      null,
      'ris-readiness-v1',
      '2.0.0',
      'AWAITING_EXPERT_VALIDATION',
      v_document,
      v_hash,
      p_actor,
      coalesce(
        nullif(trim(coalesce(p_change_note, '')), ''),
        'RIS 2.0 readiness policy draft'
      )
    )
    returning * into v_policy;
  else
    update public.readiness_policies
       set engine_version = '2.0.0',
           status = 'AWAITING_EXPERT_VALIDATION',
           policy_document = v_document,
           content_hash = v_hash,
           expert_validation_record_id = null,
           reviewed_by = null,
           change_note = coalesce(
             nullif(trim(coalesce(p_change_note, '')), ''),
             change_note,
             'RIS 2.0 readiness policy draft'
           )
     where id = v_policy.id
     returning * into v_policy;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, null, 'ris.readiness_policy_configured', 'readiness_policy',
    v_policy.id::text,
    jsonb_build_object(
      'curriculum_version_id', p_curriculum_version_id,
      'content_hash', v_hash,
      'critical_competency_count',
      cardinality(coalesce(p_critical_competency_ids, '{}'::text[]))
    )
  );
  return v_policy.id;
end;
$$;

create or replace function public.review_ris_readiness_policy(
  p_policy_id uuid,
  p_actor uuid,
  p_expected_content_hash text,
  p_decision text,
  p_reviewer_credentials text,
  p_scenario_results jsonb,
  p_limitation_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.readiness_policies%rowtype;
  v_validation_id uuid;
  v_decision text := upper(trim(coalesce(p_decision, '')));
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators may review RIS readiness policy';
  end if;
  select *
    into v_policy
    from public.readiness_policies
   where id = p_policy_id
   for update;
  if v_policy.id is null then
    raise exception 'RIS readiness policy not found';
  end if;
  if v_policy.status in ('PUBLISHED', 'RETIRED') then
    raise exception 'published RIS readiness policy is immutable';
  end if;
  if p_expected_content_hash <> v_policy.content_hash then
    raise exception 'readiness policy changed since the review screen was opened';
  end if;
  if v_decision = 'APPROVED' then
    if not public._ris_review_scenarios_pass(
      p_scenario_results,
      array[
        'separate_dimensions',
        'critical_safety',
        'prerequisites',
        'stability',
        'explainability'
      ]
    ) then
      raise exception 'all readiness expert-review scenarios must pass';
    end if;
    if not exists (
      select 1
        from jsonb_array_elements(v_policy.policy_document -> 'competencyRules') rule
       where coalesce((rule ->> 'critical')::boolean, false)
    ) then
      raise exception 'mark at least one explicitly safety-critical competency';
    end if;
  end if;

  v_validation_id := public._record_ris_definition_review(
    'READINESS_POLICY',
    v_policy.id,
    v_policy.content_hash,
    p_actor,
    v_decision,
    p_reviewer_credentials,
    p_scenario_results,
    p_limitation_note
  );
  update public.readiness_policies
     set status = 'AWAITING_EXPERT_VALIDATION',
         expert_validation_record_id = case
           when v_decision = 'APPROVED' then v_validation_id
           else null
         end,
         reviewed_by = case
           when v_decision = 'APPROVED' then p_actor
           else null
         end
   where id = v_policy.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, null, 'ris.readiness_policy_reviewed', 'readiness_policy',
    v_policy.id::text,
    jsonb_build_object(
      'decision', v_decision,
      'content_hash', v_policy.content_hash,
      'validation_record_id', v_validation_id
    )
  );
  return v_validation_id;
end;
$$;

create or replace function public.initialize_ris_assessment_definitions(
  p_curriculum_version_id uuid,
  p_actor uuid
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curriculum public.curriculum_versions%rowtype;
  v_module_number integer;
  v_assessment_type text;
  v_document jsonb;
  v_definition_id uuid;
  v_definition_ids uuid[] := '{}'::uuid[];
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators may initialize RIS assessments';
  end if;
  select *
    into v_curriculum
    from public.curriculum_versions
   where id = p_curriculum_version_id;
  if v_curriculum.id is null
     or v_curriculum.training_method <> 'RIS_2_0'
     or v_curriculum.source_ris_version_id is null then
    raise exception 'RIS 2.0 curriculum not found';
  end if;
  if v_curriculum.status in ('PUBLISHED', 'RETIRED') then
    raise exception 'published curriculum assessment definitions are immutable';
  end if;

  foreach v_module_number in array array[1, 2] loop
    v_assessment_type := 'RIS_MODULE_' || v_module_number::text;
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'criterionId', script.code,
        'scriptCode', script.code,
        'label', script.title,
        'moduleNumber', module.module_number,
        'required', true,
        'safetyCritical', false,
        'resultOptions', jsonb_build_array('MET', 'NOT_MET', 'NOT_ASSESSED')
      )
      order by script.sort_order, script.script_number
    ), '[]'::jsonb)
      into v_document
      from public.ris_scripts script
      join public.ris_modules module
        on module.id = script.module_id
       and module.ris_version_id = script.ris_version_id
     where script.ris_version_id = v_curriculum.source_ris_version_id
       and module.module_number = v_module_number
       and script.is_active;
    if jsonb_array_length(v_document) = 0 then
      raise exception 'RIS module % contains no assessment criteria', v_module_number;
    end if;

    select id
      into v_definition_id
      from public.assessment_definitions
     where curriculum_version_id = p_curriculum_version_id
       and assessment_type = v_assessment_type
       and status in ('DRAFT', 'AWAITING_EXPERT_VALIDATION')
     order by created_at desc
     limit 1;
    if v_definition_id is null then
      insert into public.assessment_definitions (
        curriculum_version_id,
        assessment_type,
        version_code,
        status,
        criteria_document,
        content_hash,
        created_by,
        change_note
      ) values (
        p_curriculum_version_id,
        v_assessment_type,
        'module-' || v_module_number::text || '-v1',
        'AWAITING_EXPERT_VALIDATION',
        v_document,
        public._ris_definition_content_hash(v_document),
        p_actor,
        'RIS module ' || v_module_number::text || ' toetsdefinitie'
      )
      returning id into v_definition_id;
    end if;
    v_definition_ids := array_append(v_definition_ids, v_definition_id);
  end loop;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, null, 'ris.assessment_definitions_initialized',
    'curriculum_version', p_curriculum_version_id::text,
    jsonb_build_object('definition_ids', to_jsonb(v_definition_ids))
  );
  return v_definition_ids;
end;
$$;

create or replace function public.configure_ris_assessment_definition(
  p_definition_id uuid,
  p_actor uuid,
  p_safety_critical_codes text[],
  p_change_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_definition public.assessment_definitions%rowtype;
  v_curriculum public.curriculum_versions%rowtype;
  v_module_number integer;
  v_document jsonb;
  v_hash text;
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators may configure RIS assessments';
  end if;
  select *
    into v_definition
    from public.assessment_definitions
   where id = p_definition_id
   for update;
  if v_definition.id is null
     or v_definition.assessment_type not in ('RIS_MODULE_1', 'RIS_MODULE_2') then
    raise exception 'RIS module assessment definition not found';
  end if;
  if v_definition.status in ('PUBLISHED', 'RETIRED') then
    raise exception 'published assessment definition is immutable';
  end if;
  v_module_number := right(v_definition.assessment_type, 1)::integer;
  select *
    into v_curriculum
    from public.curriculum_versions
   where id = v_definition.curriculum_version_id;

  if exists (
    select 1
      from unnest(coalesce(p_safety_critical_codes, '{}'::text[])) critical_code
     where not exists (
       select 1
         from public.ris_scripts script
         join public.ris_modules module on module.id = script.module_id
        where script.ris_version_id = v_curriculum.source_ris_version_id
          and module.module_number = v_module_number
          and script.is_active
          and script.code = critical_code
     )
  ) then
    raise exception 'safety-critical criterion does not belong to the assessment module';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'criterionId', script.code,
      'scriptCode', script.code,
      'label', script.title,
      'moduleNumber', module.module_number,
      'required', true,
      'safetyCritical', script.code = any(
        coalesce(p_safety_critical_codes, '{}'::text[])
      ),
      'resultOptions', jsonb_build_array('MET', 'NOT_MET', 'NOT_ASSESSED')
    )
    order by script.sort_order, script.script_number
  ), '[]'::jsonb)
    into v_document
    from public.ris_scripts script
    join public.ris_modules module on module.id = script.module_id
   where script.ris_version_id = v_curriculum.source_ris_version_id
     and module.module_number = v_module_number
     and script.is_active;
  v_hash := public._ris_definition_content_hash(v_document);

  update public.assessment_definitions
     set status = 'AWAITING_EXPERT_VALIDATION',
         criteria_document = v_document,
         content_hash = v_hash,
         expert_validation_record_id = null,
         reviewed_by = null,
         change_note = coalesce(
           nullif(trim(coalesce(p_change_note, '')), ''),
           change_note
         )
   where id = v_definition.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, null, 'ris.assessment_definition_configured',
    'assessment_definition', v_definition.id::text,
    jsonb_build_object(
      'content_hash', v_hash,
      'safety_critical_count',
      cardinality(coalesce(p_safety_critical_codes, '{}'::text[]))
    )
  );
  return v_definition.id;
end;
$$;

create or replace function public.review_ris_assessment_definition(
  p_definition_id uuid,
  p_actor uuid,
  p_expected_content_hash text,
  p_decision text,
  p_reviewer_credentials text,
  p_scenario_results jsonb,
  p_limitation_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_definition public.assessment_definitions%rowtype;
  v_validation_id uuid;
  v_decision text := upper(trim(coalesce(p_decision, '')));
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators may review RIS assessments';
  end if;
  select *
    into v_definition
    from public.assessment_definitions
   where id = p_definition_id
   for update;
  if v_definition.id is null
     or v_definition.assessment_type not in ('RIS_MODULE_1', 'RIS_MODULE_2') then
    raise exception 'RIS module assessment definition not found';
  end if;
  if v_definition.status in ('PUBLISHED', 'RETIRED') then
    raise exception 'published assessment definition is immutable';
  end if;
  if p_expected_content_hash <> v_definition.content_hash then
    raise exception 'assessment definition changed since the review screen was opened';
  end if;
  if v_decision = 'APPROVED' then
    if not public._ris_review_scenarios_pass(
      p_scenario_results,
      array[
        'criteria_coverage',
        'safety_criteria',
        'decision_rules',
        'student_feedback',
        'source_alignment'
      ]
    ) then
      raise exception 'all assessment expert-review scenarios must pass';
    end if;
    if not exists (
      select 1
        from jsonb_array_elements(v_definition.criteria_document) criterion
       where coalesce((criterion ->> 'safetyCritical')::boolean, false)
    ) then
      raise exception 'mark at least one safety-critical assessment criterion';
    end if;
  end if;

  v_validation_id := public._record_ris_definition_review(
    'ASSESSMENT_DEFINITION',
    v_definition.id,
    v_definition.content_hash,
    p_actor,
    v_decision,
    p_reviewer_credentials,
    p_scenario_results,
    p_limitation_note
  );
  update public.assessment_definitions
     set status = 'AWAITING_EXPERT_VALIDATION',
         expert_validation_record_id = case
           when v_decision = 'APPROVED' then v_validation_id
           else null
         end,
         reviewed_by = case
           when v_decision = 'APPROVED' then p_actor
           else null
         end
   where id = v_definition.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, null, 'ris.assessment_definition_reviewed',
    'assessment_definition', v_definition.id::text,
    jsonb_build_object(
      'decision', v_decision,
      'content_hash', v_definition.content_hash,
      'validation_record_id', v_validation_id
    )
  );
  return v_validation_id;
end;
$$;

create or replace function public._guard_ris_readiness_policy_shape()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'PUBLISHED'
     and old.status <> 'PUBLISHED'
     and (
       jsonb_array_length(coalesce(new.policy_document -> 'competencyRules', '[]'::jsonb)) <> 46
       or not exists (
         select 1
           from jsonb_array_elements(new.policy_document -> 'competencyRules') rule
          where coalesce((rule ->> 'critical')::boolean, false)
       )
       or exists (
         select 1
           from jsonb_array_elements(new.policy_document -> 'competencyRules') rule
          where coalesce((rule ->> 'critical')::boolean, false)
            and (
              coalesce((rule ->> 'compensable')::boolean, false)
              or not coalesce((rule ->> 'requireSafetyClear')::boolean, false)
            )
       )
     ) then
    raise exception 'RIS readiness publication requires 46 rules and explicit non-compensable safety-critical competencies';
  end if;
  return new;
end;
$$;

drop trigger if exists ris_readiness_policy_shape_guard
  on public.readiness_policies;
create trigger ris_readiness_policy_shape_guard
  before update on public.readiness_policies
  for each row execute function public._guard_ris_readiness_policy_shape();

create or replace function public._guard_ris_assessment_definition_shape()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_module_number integer;
  v_expected_count integer;
begin
  if new.status = 'PUBLISHED'
     and old.status <> 'PUBLISHED'
     and new.assessment_type in ('RIS_MODULE_1', 'RIS_MODULE_2') then
    v_module_number := right(new.assessment_type, 1)::integer;
    select count(*)
      into v_expected_count
      from public.curriculum_versions curriculum
      join public.ris_scripts script
        on script.ris_version_id = curriculum.source_ris_version_id
      join public.ris_modules module on module.id = script.module_id
     where curriculum.id = new.curriculum_version_id
       and module.module_number = v_module_number
       and script.is_active;
    if jsonb_array_length(new.criteria_document) <> v_expected_count
       or not exists (
         select 1
           from jsonb_array_elements(new.criteria_document) criterion
          where coalesce((criterion ->> 'safetyCritical')::boolean, false)
       )
       or exists (
         select 1
           from jsonb_array_elements(new.criteria_document) criterion
          where not coalesce((criterion ->> 'required')::boolean, false)
             or jsonb_array_length(coalesce(criterion -> 'resultOptions', '[]'::jsonb)) <> 3
       ) then
      raise exception 'RIS assessment publication requires complete required criteria and explicit safety-critical criteria';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ris_assessment_definition_shape_guard
  on public.assessment_definitions;
create trigger ris_assessment_definition_shape_guard
  before update on public.assessment_definitions
  for each row execute function public._guard_ris_assessment_definition_shape();

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
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators publish RIS readiness policy';
  end if;
  select *
    into v_policy
    from public.readiness_policies
   where id = p_policy_id
   for update;
  if v_policy.id is null then
    raise exception 'readiness policy not found';
  end if;
  update public.readiness_policies
     set status = 'RETIRED',
         retired_at = timezone('utc', now())
   where curriculum_version_id = v_policy.curriculum_version_id
     and id <> v_policy.id
     and status = 'PUBLISHED'
     and tenant_id is not distinct from v_policy.tenant_id;
  update public.readiness_policies
     set status = 'PUBLISHED',
         published_by = p_actor,
         published_at = timezone('utc', now())
   where id = p_policy_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, v_policy.tenant_id, 'ris.readiness_policy_published',
    'readiness_policy', p_policy_id::text,
    jsonb_build_object('content_hash', v_policy.content_hash)
  );
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
declare
  v_definition public.assessment_definitions%rowtype;
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators publish assessment definitions';
  end if;
  select *
    into v_definition
    from public.assessment_definitions
   where id = p_definition_id
   for update;
  if v_definition.id is null then
    raise exception 'assessment definition not found';
  end if;
  update public.assessment_definitions
     set status = 'RETIRED',
         retired_at = timezone('utc', now())
   where curriculum_version_id = v_definition.curriculum_version_id
     and assessment_type = v_definition.assessment_type
     and id <> v_definition.id
     and status = 'PUBLISHED';
  update public.assessment_definitions
     set status = 'PUBLISHED',
         published_by = p_actor,
         published_at = timezone('utc', now())
   where id = p_definition_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, null, 'ris.assessment_definition_published',
    'assessment_definition', p_definition_id::text,
    jsonb_build_object(
      'assessment_type', v_definition.assessment_type,
      'content_hash', v_definition.content_hash
    )
  );
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
declare
  v_curriculum public.curriculum_versions%rowtype;
begin
  if not public._ris_platform_admin_authorized(p_actor) then
    raise exception 'only platform administrators publish curricula';
  end if;
  select *
    into v_curriculum
    from public.curriculum_versions
   where id = p_curriculum_version_id
   for update;
  if v_curriculum.id is null then
    raise exception 'curriculum version not found';
  end if;
  update public.curriculum_versions
     set status = 'RETIRED',
         retired_at = timezone('utc', now())
   where training_method = v_curriculum.training_method
     and id <> v_curriculum.id
     and status = 'PUBLISHED';
  update public.curriculum_versions
     set status = 'PUBLISHED',
         created_by = coalesce(created_by, p_actor),
         published_by = p_actor,
         published_at = timezone('utc', now())
   where id = p_curriculum_version_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, null, 'ris.curriculum_published', 'curriculum_version',
    p_curriculum_version_id::text,
    jsonb_build_object(
      'training_method', v_curriculum.training_method,
      'content_hash', v_curriculum.content_hash
    )
  );
  return p_curriculum_version_id;
end;
$$;

revoke all on function public._ris_platform_admin_authorized(uuid) from public;
revoke all on function public._ris_definition_content_hash(jsonb) from public;
revoke all on function public._ris_review_scenarios_pass(jsonb, text[])
  from public;
revoke all on function public._record_ris_definition_review(
  text, uuid, text, uuid, text, text, jsonb, text
) from public;
revoke all on function public._guard_ris_readiness_policy_shape() from public;
revoke all on function public._guard_ris_assessment_definition_shape()
  from public;
revoke all on function public.configure_ris_readiness_policy(
  uuid, uuid, text[], integer, integer, integer, integer, integer, text
) from public;
revoke all on function public.review_ris_readiness_policy(
  uuid, uuid, text, text, text, jsonb, text
) from public;
revoke all on function public.initialize_ris_assessment_definitions(uuid, uuid)
  from public;
revoke all on function public.configure_ris_assessment_definition(
  uuid, uuid, text[], text
) from public;
revoke all on function public.review_ris_assessment_definition(
  uuid, uuid, text, text, text, jsonb, text
) from public;

revoke execute on function public.configure_ris_readiness_policy(
  uuid, uuid, text[], integer, integer, integer, integer, integer, text
) from anon, authenticated;
revoke execute on function public.review_ris_readiness_policy(
  uuid, uuid, text, text, text, jsonb, text
) from anon, authenticated;
revoke execute on function public.initialize_ris_assessment_definitions(uuid, uuid)
  from anon, authenticated;
revoke execute on function public.configure_ris_assessment_definition(
  uuid, uuid, text[], text
) from anon, authenticated;
revoke execute on function public.review_ris_assessment_definition(
  uuid, uuid, text, text, text, jsonb, text
) from anon, authenticated;

grant execute on function public.configure_ris_readiness_policy(
  uuid, uuid, text[], integer, integer, integer, integer, integer, text
) to service_role;
grant execute on function public.review_ris_readiness_policy(
  uuid, uuid, text, text, text, jsonb, text
) to service_role;
grant execute on function public.initialize_ris_assessment_definitions(uuid, uuid)
  to service_role;
grant execute on function public.configure_ris_assessment_definition(
  uuid, uuid, text[], text
) to service_role;
grant execute on function public.review_ris_assessment_definition(
  uuid, uuid, text, text, text, jsonb, text
) to service_role;
