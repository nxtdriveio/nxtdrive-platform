-- Canonical training methods, normalized readiness evidence/snapshots and
-- versioned assessments. This migration is additive: historical RIS tables
-- remain readable while new decisions use this domain.

-- ---------------------------------------------------------------------------
-- Expert validation and immutable versioned definitions
-- ---------------------------------------------------------------------------

create table if not exists public.expert_validation_records (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid references public.tenants(id) on delete restrict,
  target_type           text not null,
  target_id             uuid not null,
  status                text not null default 'AWAITING_EXPERT_VALIDATION',
  content_hash          text not null,
  reviewer_user_id      uuid references auth.users(id) on delete restrict,
  reviewer_credentials  text,
  scenario_results      jsonb not null default '[]'::jsonb,
  limitation_note       text,
  signed_at             timestamptz,
  created_by            uuid references auth.users(id) on delete restrict,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now()),
  unique (target_type, target_id, content_hash),
  check (target_type in ('CURRICULUM', 'READINESS_POLICY', 'ASSESSMENT_DEFINITION')),
  check (status in (
    'AWAITING_EXPERT_VALIDATION',
    'IN_REVIEW',
    'CHANGES_REQUIRED',
    'APPROVED'
  )),
  check (char_length(trim(content_hash)) > 0),
  check (jsonb_typeof(scenario_results) = 'array')
);

create or replace function public._guard_expert_validation_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'APPROVED' then
      raise exception 'approved expert validation records are immutable';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'APPROVED' then
    raise exception 'approved expert validation records are immutable';
  end if;

  if new.status = 'APPROVED' and (
    new.reviewer_user_id is null
    or nullif(trim(coalesce(new.reviewer_credentials, '')), '') is null
    or new.signed_at is null
    or jsonb_array_length(new.scenario_results) = 0
  ) then
    raise exception 'expert approval requires reviewer, credentials, signed_at and scenario results';
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists expert_validation_records_guard
  on public.expert_validation_records;
create trigger expert_validation_records_guard
  before update or delete on public.expert_validation_records
  for each row execute function public._guard_expert_validation_record();

create table if not exists public.curriculum_versions (
  id                           uuid primary key default gen_random_uuid(),
  training_method              text not null,
  version_code                 text not null,
  status                       text not null default 'DRAFT',
  content_document             jsonb not null default '{}'::jsonb,
  content_hash                 text not null,
  source_ris_version_id        uuid references public.ris_versions(id) on delete restrict,
  expert_validation_record_id  uuid references public.expert_validation_records(id) on delete restrict,
  created_by                   uuid references auth.users(id) on delete restrict,
  reviewed_by                  uuid references auth.users(id) on delete restrict,
  change_note                  text,
  published_by                 uuid references auth.users(id) on delete restrict,
  published_at                 timestamptz,
  retired_at                   timestamptz,
  created_at                   timestamptz not null default timezone('utc', now()),
  updated_at                   timestamptz not null default timezone('utc', now()),
  unique (training_method, version_code),
  unique (source_ris_version_id),
  check (training_method in ('STANDARD', 'RIS_2_0', 'RIS_1_0_LEGACY')),
  check (status in ('DRAFT', 'AWAITING_EXPERT_VALIDATION', 'PUBLISHED', 'RETIRED')),
  check (char_length(trim(version_code)) > 0),
  check (char_length(trim(content_hash)) > 0),
  check (jsonb_typeof(content_document) = 'object'),
  check (
    (status = 'PUBLISHED' and published_at is not null and published_by is not null)
    or status <> 'PUBLISHED'
  )
);

create unique index if not exists curriculum_versions_one_published_method
  on public.curriculum_versions (training_method)
  where status = 'PUBLISHED';

create table if not exists public.readiness_policies (
  id                           uuid primary key default gen_random_uuid(),
  curriculum_version_id        uuid not null references public.curriculum_versions(id) on delete restrict,
  tenant_id                    uuid references public.tenants(id) on delete restrict,
  version_code                 text not null,
  engine_version               text not null,
  status                       text not null default 'DRAFT',
  policy_document              jsonb not null,
  content_hash                 text not null,
  expert_validation_record_id  uuid references public.expert_validation_records(id) on delete restrict,
  created_by                   uuid references auth.users(id) on delete restrict,
  reviewed_by                  uuid references auth.users(id) on delete restrict,
  change_note                  text,
  published_by                 uuid references auth.users(id) on delete restrict,
  published_at                 timestamptz,
  retired_at                   timestamptz,
  created_at                   timestamptz not null default timezone('utc', now()),
  updated_at                   timestamptz not null default timezone('utc', now()),
  unique (curriculum_version_id, tenant_id, version_code),
  check (status in ('DRAFT', 'AWAITING_EXPERT_VALIDATION', 'PUBLISHED', 'RETIRED')),
  check (char_length(trim(version_code)) > 0),
  check (char_length(trim(engine_version)) > 0),
  check (char_length(trim(content_hash)) > 0),
  check (jsonb_typeof(policy_document) = 'object'),
  check (
    (status = 'PUBLISHED' and published_at is not null and published_by is not null)
    or status <> 'PUBLISHED'
  )
);

create unique index if not exists readiness_policies_one_global_published
  on public.readiness_policies (curriculum_version_id)
  where status = 'PUBLISHED' and tenant_id is null;

create unique index if not exists readiness_policies_one_tenant_published
  on public.readiness_policies (curriculum_version_id, tenant_id)
  where status = 'PUBLISHED' and tenant_id is not null;

create table if not exists public.assessment_definitions (
  id                           uuid primary key default gen_random_uuid(),
  curriculum_version_id        uuid not null references public.curriculum_versions(id) on delete restrict,
  assessment_type              text not null,
  version_code                 text not null,
  status                       text not null default 'DRAFT',
  criteria_document            jsonb not null default '[]'::jsonb,
  content_hash                 text not null,
  expert_validation_record_id  uuid references public.expert_validation_records(id) on delete restrict,
  created_by                   uuid references auth.users(id) on delete restrict,
  reviewed_by                  uuid references auth.users(id) on delete restrict,
  change_note                  text,
  published_by                 uuid references auth.users(id) on delete restrict,
  published_at                 timestamptz,
  retired_at                   timestamptz,
  created_at                   timestamptz not null default timezone('utc', now()),
  updated_at                   timestamptz not null default timezone('utc', now()),
  unique (curriculum_version_id, assessment_type, version_code),
  check (assessment_type in (
    'RIS_MODULE_1',
    'RIS_MODULE_2',
    'RIS_CBR_TEST',
    'RIS_CBR_EXAM',
    'INTERNAL_MOCK_EXAM',
    'STANDARD_PROGRESS_ASSESSMENT'
  )),
  check (status in ('DRAFT', 'AWAITING_EXPERT_VALIDATION', 'PUBLISHED', 'RETIRED')),
  check (char_length(trim(version_code)) > 0),
  check (char_length(trim(content_hash)) > 0),
  check (jsonb_typeof(criteria_document) = 'array'),
  check (
    (status = 'PUBLISHED' and published_at is not null and published_by is not null)
    or status <> 'PUBLISHED'
  )
);

create unique index if not exists assessment_definitions_one_published_type
  on public.assessment_definitions (curriculum_version_id, assessment_type)
  where status = 'PUBLISHED';

create or replace function public._guard_published_definition_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    if old.status in ('PUBLISHED', 'RETIRED') then
      raise exception 'published versioned definitions cannot be deleted';
    end if;
    return old;
  end if;

  if old.status in ('PUBLISHED', 'RETIRED') then
    v_old := to_jsonb(old) - array['status', 'retired_at', 'updated_at'];
    v_new := to_jsonb(new) - array['status', 'retired_at', 'updated_at'];
    if v_old <> v_new
       or (old.status = 'PUBLISHED' and new.status not in ('PUBLISHED', 'RETIRED'))
       or (old.status = 'RETIRED' and new.status <> 'RETIRED') then
      raise exception 'published definitions are immutable; create a new version';
    end if;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists curriculum_versions_immutable
  on public.curriculum_versions;
create trigger curriculum_versions_immutable
  before update or delete on public.curriculum_versions
  for each row execute function public._guard_published_definition_immutable();

drop trigger if exists readiness_policies_immutable
  on public.readiness_policies;
create trigger readiness_policies_immutable
  before update or delete on public.readiness_policies
  for each row execute function public._guard_published_definition_immutable();

drop trigger if exists assessment_definitions_immutable
  on public.assessment_definitions;
create trigger assessment_definitions_immutable
  before update or delete on public.assessment_definitions
  for each row execute function public._guard_published_definition_immutable();

-- Existing RIS catalog versions are deliberately not approved during a code
-- migration. They enter the expert-validation queue with a transparent hash.
insert into public.curriculum_versions (
  training_method,
  version_code,
  status,
  content_document,
  content_hash,
  source_ris_version_id,
  change_note
)
select
  'RIS_2_0',
  'ris-' || v.id::text,
  'AWAITING_EXPERT_VALIDATION',
  jsonb_build_object(
    'sourceRisVersionId', v.id,
    'name', v.name,
    'description', v.description
  ),
  'AWAITING_EXPERT_VALIDATION:' || v.id::text,
  v.id,
  'Backfilled from the pre-canon RIS catalog; no expert approval inferred.'
from public.ris_versions v
on conflict (source_ris_version_id) do nothing;

-- Technical STANDARD foundation only. It deliberately remains awaiting
-- validation; no official content or expert approval is inferred.
insert into public.curriculum_versions (
  training_method,
  version_code,
  status,
  content_document,
  content_hash,
  change_note
) values (
  'STANDARD',
  'standard-foundation-v1',
  'AWAITING_EXPERT_VALIDATION',
  jsonb_build_object(
    'title', 'NXTDRIVE standaardopleiding',
    'contentStatus', 'AWAITING_EXPERT_VALIDATION',
    'competencies', jsonb_build_array()
  ),
  'AWAITING_EXPERT_VALIDATION:standard-foundation-v1',
  'Technical enrollment foundation; contains no inferred expert-approved curriculum.'
)
on conflict (training_method, version_code) do nothing;

alter table public.ris_versions
  add column if not exists curriculum_version_id uuid
    references public.curriculum_versions(id) on delete restrict;

update public.ris_versions v
   set curriculum_version_id = c.id
  from public.curriculum_versions c
 where c.source_ris_version_id = v.id
   and v.curriculum_version_id is null;

-- ---------------------------------------------------------------------------
-- Enrollment mode and immutable RIS 1.0 history
-- ---------------------------------------------------------------------------

create table if not exists public.training_enrollments (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete restrict,
  student_id             uuid not null,
  training_method        text not null,
  curriculum_version_id  uuid references public.curriculum_versions(id) on delete restrict,
  status                 text not null default 'ACTIVE',
  source                 text not null default 'NATIVE',
  source_reference       text,
  started_at             timestamptz,
  completed_at           timestamptz,
  created_by             uuid references auth.users(id) on delete restrict,
  created_at             timestamptz not null default timezone('utc', now()),
  updated_at             timestamptz not null default timezone('utc', now()),
  unique (id, tenant_id),
  constraint training_enrollments_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students(id, tenant_id)
    on delete restrict,
  check (training_method in ('STANDARD', 'RIS_2_0', 'RIS_1_0_LEGACY')),
  check (status in ('ACTIVE', 'COMPLETED', 'HISTORICAL', 'MIGRATION_PENDING')),
  check (source in ('NATIVE', 'LEGACY_IMPORT', 'MIGRATION')),
  check (
    training_method <> 'RIS_1_0_LEGACY'
    or (status = 'HISTORICAL' and source = 'LEGACY_IMPORT')
  )
);

create unique index if not exists training_enrollments_one_active_student
  on public.training_enrollments (tenant_id, student_id)
  where status = 'ACTIVE';

create index if not exists training_enrollments_method_status
  on public.training_enrollments (tenant_id, training_method, status);

create table if not exists public.legacy_training_corrections (
  id                    uuid primary key default gen_random_uuid(),
  enrollment_id         uuid not null references public.training_enrollments(id) on delete restrict,
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  original_source_hash  text not null,
  correction_document   jsonb not null,
  reason                text not null,
  corrected_by          uuid not null references auth.users(id) on delete restrict,
  corrected_at          timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(correction_document) = 'object'),
  check (char_length(trim(reason)) > 0)
);

create or replace function public._guard_training_enrollment_method()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_curriculum_method text;
begin
  if tg_op = 'DELETE' then
    if old.training_method = 'RIS_1_0_LEGACY' then
      raise exception 'RIS_1_0_LEGACY enrollment history is immutable';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.training_method = 'RIS_1_0_LEGACY' then
    raise exception 'RIS_1_0_LEGACY enrollment history is immutable; append an administrative correction';
  end if;

  if new.training_method = 'RIS_1_0_LEGACY'
     and (new.status <> 'HISTORICAL' or new.source <> 'LEGACY_IMPORT') then
    raise exception 'RIS_1_0_LEGACY is import-only historical data';
  end if;
  if new.status = 'ACTIVE' and new.training_method = 'RIS_1_0_LEGACY' then
    raise exception 'new RIS 1.0 enrollments are forbidden';
  end if;
  if new.status = 'ACTIVE' and new.curriculum_version_id is null then
    raise exception 'active training enrollment requires a curriculum version';
  end if;
  if new.curriculum_version_id is not null then
    select training_method into v_curriculum_method
      from public.curriculum_versions
     where id = new.curriculum_version_id;
    if v_curriculum_method is null or v_curriculum_method <> new.training_method then
      raise exception 'curriculum method does not match enrollment method';
    end if;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists training_enrollments_method_guard
  on public.training_enrollments;
create trigger training_enrollments_method_guard
  before insert or update or delete on public.training_enrollments
  for each row execute function public._guard_training_enrollment_method();

create or replace function public._append_only_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% records are append-only', tg_table_name;
end;
$$;

drop trigger if exists legacy_training_corrections_append_only
  on public.legacy_training_corrections;
create trigger legacy_training_corrections_append_only
  before update or delete on public.legacy_training_corrections
  for each row execute function public._append_only_record();

create or replace function public.create_training_enrollment(
  p_tenant_id uuid,
  p_student_id uuid,
  p_training_method text,
  p_curriculum_version_id uuid,
  p_actor uuid,
  p_started_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_curriculum_version_id uuid;
begin
  if not public._tenant_staff_authorized(p_actor, p_tenant_id) then
    raise exception 'actor not authorized for tenant';
  end if;
  if p_training_method not in ('STANDARD', 'RIS_2_0') then
    raise exception 'new enrollments support only STANDARD or RIS_2_0';
  end if;
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student not found in tenant';
  end if;

  v_curriculum_version_id := p_curriculum_version_id;
  if v_curriculum_version_id is null then
    select id into v_curriculum_version_id
      from public.curriculum_versions
     where training_method = p_training_method
       and status in ('PUBLISHED', 'AWAITING_EXPERT_VALIDATION', 'DRAFT')
     order by
       case status
         when 'PUBLISHED' then 1
         when 'AWAITING_EXPERT_VALIDATION' then 2
         else 3
       end,
       created_at desc
     limit 1;
  end if;
  if v_curriculum_version_id is null then
    raise exception 'no curriculum version configured for training method %', p_training_method;
  end if;

  insert into public.training_enrollments (
    tenant_id, student_id, training_method, curriculum_version_id,
    status, source, started_at, created_by
  ) values (
    p_tenant_id, p_student_id, p_training_method, v_curriculum_version_id,
    'ACTIVE', 'NATIVE', coalesce(p_started_at, timezone('utc', now())), p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'training.enrollment_created',
    'training_enrollment', v_id::text,
    jsonb_build_object('student_id', p_student_id, 'training_method', p_training_method)
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Normalized evidence and immutable evaluation snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.normalized_readiness_evidence (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  enrollment_id         uuid not null,
  competency_id         text not null,
  observed_at           timestamptz not null,
  source_type           text not null,
  observed              boolean not null,
  competence_band       text not null,
  independence_band     text not null,
  safety_status         text not null,
  context_tags          text[] not null default '{}',
  instructor_id         uuid references auth.users(id) on delete restrict,
  lesson_id             uuid references public.lessons(id) on delete restrict,
  assessment_id         uuid,
  source_evidence_id    text not null,
  legacy_confidence     text,
  supersedes_evidence_id uuid references public.normalized_readiness_evidence(id) on delete restrict,
  evidence_document     jsonb not null default '{}'::jsonb,
  evidence_hash         text not null,
  created_at            timestamptz not null default timezone('utc', now()),
  unique (tenant_id, source_type, source_evidence_id),
  constraint normalized_evidence_enrollment_tenant_fkey
    foreign key (enrollment_id, tenant_id)
    references public.training_enrollments(id, tenant_id)
    on delete restrict,
  check (char_length(trim(competency_id)) > 0),
  check (source_type in (
    'STANDARD_LESSON', 'RIS_SCRIPT', 'MODULE_TEST', 'CBR_RESULT', 'LEGACY_IMPORT'
  )),
  check (competence_band in (
    'UNKNOWN', 'ATTENTION_REQUIRED', 'DEVELOPING', 'SUFFICIENT', 'STABLE'
  )),
  check (independence_band in (
    'UNKNOWN', 'INSTRUCTED', 'SUPPORTED', 'COACHED', 'INDEPENDENT', 'TRANSFERABLE'
  )),
  check (safety_status in ('UNKNOWN', 'CLEAR', 'ATTENTION', 'BLOCKER')),
  check (legacy_confidence is null or legacy_confidence in ('LOW', 'MEDIUM', 'HIGH')),
  check (jsonb_typeof(evidence_document) = 'object'),
  check (char_length(trim(evidence_hash)) > 0)
);

create index if not exists normalized_evidence_enrollment_competency
  on public.normalized_readiness_evidence (
    tenant_id, enrollment_id, competency_id, observed_at desc
  );

drop trigger if exists normalized_readiness_evidence_append_only
  on public.normalized_readiness_evidence;
create trigger normalized_readiness_evidence_append_only
  before update or delete on public.normalized_readiness_evidence
  for each row execute function public._append_only_record();

create table if not exists public.readiness_input_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  snapshot_key          text not null unique,
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  enrollment_id         uuid not null,
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete restrict,
  policy_id             uuid not null references public.readiness_policies(id) on delete restrict,
  schema_version        text not null,
  evaluated_at          timestamptz not null,
  snapshot_document     jsonb not null,
  snapshot_hash         text not null,
  created_at            timestamptz not null default timezone('utc', now()),
  constraint readiness_input_enrollment_tenant_fkey
    foreign key (enrollment_id, tenant_id)
    references public.training_enrollments(id, tenant_id)
    on delete restrict,
  check (schema_version = 'readiness-input.v1'),
  check (jsonb_typeof(snapshot_document) = 'object'),
  check (char_length(trim(snapshot_hash)) > 0)
);

create table if not exists public.readiness_result_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  snapshot_key          text not null unique,
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  input_snapshot_id     uuid not null references public.readiness_input_snapshots(id) on delete restrict,
  schema_version        text not null,
  engine_version        text not null,
  readiness_status      text not null,
  execution_mode        text not null,
  snapshot_document     jsonb not null,
  snapshot_hash         text not null,
  created_at            timestamptz not null default timezone('utc', now()),
  check (schema_version = 'readiness-result.v1'),
  check (readiness_status in (
    'CONFIGURATION_INCOMPLETE',
    'INSUFFICIENT_EVIDENCE',
    'BLOCKED',
    'DEVELOPING',
    'NEARLY_REVIEWABLE',
    'REVIEW_ELIGIBLE'
  )),
  check (execution_mode in ('SHADOW', 'ACTIVE')),
  check (jsonb_typeof(snapshot_document) = 'object'),
  check (char_length(trim(snapshot_hash)) > 0)
);

create table if not exists public.readiness_evaluations (
  id                    uuid primary key,
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  enrollment_id         uuid not null,
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete restrict,
  policy_id             uuid not null references public.readiness_policies(id) on delete restrict,
  input_snapshot_id     uuid not null unique references public.readiness_input_snapshots(id) on delete restrict,
  result_snapshot_id    uuid not null unique references public.readiness_result_snapshots(id) on delete restrict,
  readiness_status      text not null,
  execution_mode        text not null,
  engine_version        text not null,
  reason_ids            text[] not null default '{}',
  blocker_snapshot      jsonb not null default '[]'::jsonb,
  evaluated_at          timestamptz not null,
  created_by            uuid references auth.users(id) on delete restrict,
  created_at            timestamptz not null default timezone('utc', now()),
  constraint readiness_evaluations_enrollment_tenant_fkey
    foreign key (enrollment_id, tenant_id)
    references public.training_enrollments(id, tenant_id)
    on delete restrict,
  check (readiness_status in (
    'CONFIGURATION_INCOMPLETE',
    'INSUFFICIENT_EVIDENCE',
    'BLOCKED',
    'DEVELOPING',
    'NEARLY_REVIEWABLE',
    'REVIEW_ELIGIBLE'
  )),
  check (execution_mode in ('SHADOW', 'ACTIVE')),
  check (jsonb_typeof(blocker_snapshot) = 'array')
);

create index if not exists readiness_evaluations_latest
  on public.readiness_evaluations (
    tenant_id, enrollment_id, evaluated_at desc
  );

drop trigger if exists readiness_input_snapshots_append_only
  on public.readiness_input_snapshots;
create trigger readiness_input_snapshots_append_only
  before update or delete on public.readiness_input_snapshots
  for each row execute function public._append_only_record();

drop trigger if exists readiness_result_snapshots_append_only
  on public.readiness_result_snapshots;
create trigger readiness_result_snapshots_append_only
  before update or delete on public.readiness_result_snapshots
  for each row execute function public._append_only_record();

drop trigger if exists readiness_evaluations_append_only
  on public.readiness_evaluations;
create trigger readiness_evaluations_append_only
  before update or delete on public.readiness_evaluations
  for each row execute function public._append_only_record();

create or replace function public.record_readiness_evaluation(
  p_evaluation_id uuid,
  p_tenant_id uuid,
  p_enrollment_id uuid,
  p_curriculum_version_id uuid,
  p_policy_id uuid,
  p_actor uuid,
  p_evaluated_at timestamptz,
  p_engine_version text,
  p_readiness_status text,
  p_execution_mode text,
  p_input_snapshot_key text,
  p_input_snapshot_hash text,
  p_input_snapshot jsonb,
  p_result_snapshot_key text,
  p_result_snapshot_hash text,
  p_result_snapshot jsonb,
  p_reason_ids text[],
  p_blocker_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_id uuid;
  v_result_id uuid;
  v_method text;
  v_policy public.readiness_policies%rowtype;
begin
  if not public._tenant_staff_authorized(p_actor, p_tenant_id) then
    raise exception 'actor not authorized for tenant';
  end if;
  select training_method into v_method
    from public.training_enrollments
   where id = p_enrollment_id and tenant_id = p_tenant_id;
  if v_method is null then
    raise exception 'training enrollment not found';
  end if;
  select * into v_policy from public.readiness_policies where id = p_policy_id;
  if v_policy.id is null
     or v_policy.curriculum_version_id <> p_curriculum_version_id
     or v_policy.engine_version <> p_engine_version then
    raise exception 'readiness policy/curriculum/engine mismatch';
  end if;
  if v_method = 'RIS_1_0_LEGACY' and p_execution_mode <> 'SHADOW' then
    raise exception 'RIS_1_0_LEGACY evaluations are shadow-only';
  end if;
  if p_execution_mode = 'ACTIVE' and v_policy.status <> 'PUBLISHED' then
    raise exception 'active readiness evaluation requires a published policy';
  end if;

  insert into public.readiness_input_snapshots (
    snapshot_key, tenant_id, enrollment_id, curriculum_version_id, policy_id,
    schema_version, evaluated_at, snapshot_document, snapshot_hash
  ) values (
    p_input_snapshot_key, p_tenant_id, p_enrollment_id,
    p_curriculum_version_id, p_policy_id, 'readiness-input.v1',
    p_evaluated_at, p_input_snapshot, p_input_snapshot_hash
  ) returning id into v_input_id;

  insert into public.readiness_result_snapshots (
    snapshot_key, tenant_id, input_snapshot_id, schema_version, engine_version,
    readiness_status, execution_mode, snapshot_document, snapshot_hash
  ) values (
    p_result_snapshot_key, p_tenant_id, v_input_id, 'readiness-result.v1',
    p_engine_version, p_readiness_status, p_execution_mode,
    p_result_snapshot, p_result_snapshot_hash
  ) returning id into v_result_id;

  insert into public.readiness_evaluations (
    id, tenant_id, enrollment_id, curriculum_version_id, policy_id,
    input_snapshot_id, result_snapshot_id, readiness_status, execution_mode,
    engine_version, reason_ids, blocker_snapshot, evaluated_at, created_by
  ) values (
    p_evaluation_id, p_tenant_id, p_enrollment_id, p_curriculum_version_id,
    p_policy_id, v_input_id, v_result_id, p_readiness_status, p_execution_mode,
    p_engine_version, coalesce(p_reason_ids, '{}'), coalesce(p_blocker_snapshot, '[]'::jsonb),
    p_evaluated_at, p_actor
  );

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'readiness.evaluated', 'readiness_evaluation',
    p_evaluation_id::text,
    jsonb_build_object(
      'status', p_readiness_status,
      'execution_mode', p_execution_mode,
      'input_snapshot_key', p_input_snapshot_key,
      'result_snapshot_key', p_result_snapshot_key
    )
  );
  return p_evaluation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Versioned assessment lifecycle, audited overrides and retests
-- ---------------------------------------------------------------------------

create table if not exists public.assessment_override_policies (
  tenant_id                       uuid primary key references public.tenants(id) on delete restrict,
  overrides_allowed               boolean not null default true,
  second_approval_required        boolean not null default false,
  safety_blockers_overridable     boolean not null default false,
  maximum_evaluation_age_minutes  integer not null default 1440,
  updated_by                      uuid references auth.users(id) on delete restrict,
  updated_at                      timestamptz not null default timezone('utc', now()),
  check (maximum_evaluation_age_minutes between 1 and 10080)
);

create table if not exists public.assessment_records (
  id                             uuid primary key default gen_random_uuid(),
  tenant_id                      uuid not null references public.tenants(id) on delete restrict,
  enrollment_id                  uuid not null,
  assessment_definition_id       uuid not null references public.assessment_definitions(id) on delete restrict,
  assessment_type                text not null,
  curriculum_version_id          uuid not null references public.curriculum_versions(id) on delete restrict,
  policy_id                      uuid not null references public.readiness_policies(id) on delete restrict,
  readiness_evaluation_id        uuid references public.readiness_evaluations(id) on delete restrict,
  status                         text not null default 'DRAFT',
  scheduled_at                   timestamptz,
  started_at                     timestamptz,
  completed_at                   timestamptz,
  assessor_id                    uuid references auth.users(id) on delete restrict,
  result                         text,
  feedback                       text,
  learner_feedback               text,
  published_by                   uuid references auth.users(id) on delete restrict,
  published_at                   timestamptz,
  previous_attempt_id            uuid references public.assessment_records(id) on delete restrict,
  attempt_number                 integer not null default 1,
  void_reason                    text,
  created_by                     uuid references auth.users(id) on delete restrict,
  created_at                     timestamptz not null default timezone('utc', now()),
  updated_at                     timestamptz not null default timezone('utc', now()),
  unique (id, tenant_id),
  unique (enrollment_id, assessment_type, attempt_number),
  constraint assessment_records_enrollment_tenant_fkey
    foreign key (enrollment_id, tenant_id)
    references public.training_enrollments(id, tenant_id)
    on delete restrict,
  check (assessment_type in (
    'RIS_MODULE_1',
    'RIS_MODULE_2',
    'RIS_CBR_TEST',
    'RIS_CBR_EXAM',
    'INTERNAL_MOCK_EXAM',
    'STANDARD_PROGRESS_ASSESSMENT'
  )),
  check (status in (
    'DRAFT', 'PLANNED', 'IN_PROGRESS', 'AWAITING_REVIEW',
    'COMPLETED', 'PUBLISHED', 'VOIDED'
  )),
  check (result is null or result in ('PASSED', 'NOT_PASSED', 'NO_DECISION')),
  check (attempt_number >= 1),
  check (
    (status = 'PUBLISHED' and published_by is not null and published_at is not null)
    or status <> 'PUBLISHED'
  ),
  check ((status = 'VOIDED' and nullif(trim(coalesce(void_reason, '')), '') is not null) or status <> 'VOIDED')
);

create table if not exists public.assessment_criterion_results (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  assessment_record_id  uuid not null,
  criterion_id          text not null,
  result                text not null,
  note                  text,
  evidence_ids          text[] not null default '{}',
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now()),
  unique (assessment_record_id, criterion_id),
  constraint assessment_criteria_record_tenant_fkey
    foreign key (assessment_record_id, tenant_id)
    references public.assessment_records(id, tenant_id)
    on delete restrict,
  check (result in ('MET', 'NOT_MET', 'NOT_ASSESSED')),
  check (char_length(trim(criterion_id)) > 0)
);

create table if not exists public.assessment_readiness_decisions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  assessment_record_id  uuid not null,
  evaluation_id         uuid not null references public.readiness_evaluations(id) on delete restrict,
  decision              text not null,
  reason_code           text not null,
  note                  text not null,
  decided_by            uuid not null references auth.users(id) on delete restrict,
  decided_at            timestamptz not null,
  blocker_snapshot      jsonb not null,
  second_approved_by    uuid references auth.users(id) on delete restrict,
  second_approved_at    timestamptz,
  created_at            timestamptz not null default timezone('utc', now()),
  unique (assessment_record_id),
  constraint assessment_decision_record_tenant_fkey
    foreign key (assessment_record_id, tenant_id)
    references public.assessment_records(id, tenant_id)
    on delete restrict,
  check (decision in ('APPROVED', 'DEFERRED', 'OVERRIDE_APPROVED', 'OVERRIDE_DEFERRED')),
  check (char_length(trim(reason_code)) > 0),
  check (char_length(trim(note)) > 0),
  check (jsonb_typeof(blocker_snapshot) = 'array'),
  check (
    (second_approved_by is null and second_approved_at is null)
    or (second_approved_by is not null and second_approved_at is not null)
  ),
  check (second_approved_by is null or second_approved_by <> decided_by)
);

create or replace function public._guard_assessment_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_method text;
  v_allowed boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'assessment history cannot be deleted; use VOIDED';
  end if;

  select training_method into v_method
    from public.training_enrollments
   where id = new.enrollment_id and tenant_id = new.tenant_id;
  if v_method is null then
    raise exception 'assessment requires a valid training enrollment';
  end if;
  if v_method = 'RIS_1_0_LEGACY' then
    raise exception 'new or changed assessments are forbidden for RIS_1_0_LEGACY';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('PUBLISHED', 'VOIDED') then
      raise exception 'closed assessment attempts are immutable';
    end if;
    if old.status = new.status then
      v_allowed := true;
    elsif old.status = 'DRAFT' and new.status in ('PLANNED', 'VOIDED') then
      v_allowed := true;
    elsif old.status = 'PLANNED' and new.status in ('IN_PROGRESS', 'VOIDED') then
      v_allowed := true;
    elsif old.status = 'IN_PROGRESS' and new.status in ('AWAITING_REVIEW', 'VOIDED') then
      v_allowed := true;
    elsif old.status = 'AWAITING_REVIEW' and new.status in ('IN_PROGRESS', 'COMPLETED', 'VOIDED') then
      v_allowed := true;
    elsif old.status = 'COMPLETED' and new.status in ('PUBLISHED', 'VOIDED') then
      v_allowed := true;
    end if;
    if not v_allowed then
      raise exception 'invalid assessment lifecycle transition % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'PLANNED' and new.scheduled_at is null then
    raise exception 'PLANNED assessment requires scheduled_at';
  end if;
  if new.status = 'IN_PROGRESS' and new.started_at is null then
    raise exception 'IN_PROGRESS assessment requires started_at';
  end if;
  if new.status in ('COMPLETED', 'PUBLISHED')
     and (new.completed_at is null or new.assessor_id is null or new.result is null) then
    raise exception 'completed assessment requires time, assessor and result';
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists assessment_records_lifecycle_guard
  on public.assessment_records;
create trigger assessment_records_lifecycle_guard
  before insert or update or delete on public.assessment_records
  for each row execute function public._guard_assessment_lifecycle();

create or replace function public._guard_assessment_override()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_policy public.assessment_override_policies%rowtype;
  v_evaluation public.readiness_evaluations%rowtype;
  v_record public.assessment_records%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'readiness decisions are immutable';
  end if;

  select * into v_record
    from public.assessment_records
   where id = new.assessment_record_id and tenant_id = new.tenant_id;
  select * into v_evaluation
    from public.readiness_evaluations
   where id = new.evaluation_id and tenant_id = new.tenant_id;
  if v_record.id is null or v_evaluation.id is null
     or v_record.enrollment_id <> v_evaluation.enrollment_id then
    raise exception 'assessment decision/evaluation mismatch';
  end if;
  if new.blocker_snapshot <> v_evaluation.blocker_snapshot then
    raise exception 'decision must preserve the exact current blocker snapshot';
  end if;

  if new.decision like 'OVERRIDE_%' then
    select * into v_policy
      from public.assessment_override_policies
     where tenant_id = new.tenant_id;
    if v_policy.tenant_id is null or not v_policy.overrides_allowed then
      raise exception 'assessment overrides are disabled';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(new.blocker_snapshot) blocker
       where coalesce((blocker ->> 'safetyRelated')::boolean, false)
    ) and not v_policy.safety_blockers_overridable then
      raise exception 'open safety blockers cannot be overridden';
    end if;
    if v_policy.second_approval_required and (
      new.second_approved_by is null
      or new.second_approved_at is null
      or new.second_approved_by = new.decided_by
    ) then
      raise exception 'override requires a second independent approval';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_readiness_decisions_guard
  on public.assessment_readiness_decisions;
create trigger assessment_readiness_decisions_guard
  before insert or update or delete on public.assessment_readiness_decisions
  for each row execute function public._guard_assessment_override();

drop trigger if exists assessment_criteria_closed_guard
  on public.assessment_criterion_results;
create or replace function public._guard_assessment_criterion_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_record_id uuid;
begin
  v_record_id := coalesce(new.assessment_record_id, old.assessment_record_id);
  select status into v_status from public.assessment_records where id = v_record_id;
  if v_status in ('PUBLISHED', 'VOIDED') then
    raise exception 'criteria of closed assessment attempts are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger assessment_criteria_closed_guard
  before insert or update or delete on public.assessment_criterion_results
  for each row execute function public._guard_assessment_criterion_mutation();

create or replace function public.create_assessment_retest(
  p_previous_assessment_id uuid,
  p_new_assessment_definition_id uuid,
  p_policy_id uuid,
  p_readiness_evaluation_id uuid,
  p_scheduled_at timestamptz,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.assessment_records%rowtype;
  v_definition public.assessment_definitions%rowtype;
  v_new_id uuid;
begin
  select * into v_previous
    from public.assessment_records
   where id = p_previous_assessment_id
   for share;
  if v_previous.id is null or v_previous.status not in ('COMPLETED', 'PUBLISHED', 'VOIDED') then
    raise exception 'retest requires a closed previous attempt';
  end if;
  if not public._tenant_staff_authorized(p_actor, v_previous.tenant_id) then
    raise exception 'actor not authorized for tenant';
  end if;
  select * into v_definition
    from public.assessment_definitions
   where id = p_new_assessment_definition_id;
  if v_definition.id is null
     or v_definition.assessment_type <> v_previous.assessment_type then
    raise exception 'retest definition does not match assessment type';
  end if;

  insert into public.assessment_records (
    tenant_id, enrollment_id, assessment_definition_id, assessment_type,
    curriculum_version_id, policy_id, readiness_evaluation_id, status,
    scheduled_at, previous_attempt_id, attempt_number, created_by
  ) values (
    v_previous.tenant_id, v_previous.enrollment_id, v_definition.id,
    v_previous.assessment_type, v_definition.curriculum_version_id, p_policy_id,
    p_readiness_evaluation_id,
    case when p_scheduled_at is null then 'DRAFT' else 'PLANNED' end,
    p_scheduled_at, v_previous.id, v_previous.attempt_number + 1, p_actor
  ) returning id into v_new_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, v_previous.tenant_id, 'assessment.retest_created',
    'assessment_record', v_new_id::text,
    jsonb_build_object(
      'previous_attempt_id', v_previous.id,
      'attempt_number', v_previous.attempt_number + 1
    )
  );
  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: learner access is restricted to explicitly PUBLISHED assessments.
-- Definitions and internal readiness evidence/snapshots are staff-only.
-- ---------------------------------------------------------------------------

alter table public.expert_validation_records enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.readiness_policies enable row level security;
alter table public.assessment_definitions enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.legacy_training_corrections enable row level security;
alter table public.normalized_readiness_evidence enable row level security;
alter table public.readiness_input_snapshots enable row level security;
alter table public.readiness_result_snapshots enable row level security;
alter table public.readiness_evaluations enable row level security;
alter table public.assessment_override_policies enable row level security;
alter table public.assessment_records enable row level security;
alter table public.assessment_criterion_results enable row level security;
alter table public.assessment_readiness_decisions enable row level security;

create policy curriculum_versions_read
  on public.curriculum_versions for select
  using (status = 'PUBLISHED' or public.is_platform_admin());
create policy readiness_policies_staff_read
  on public.readiness_policies for select
  using (
    public.is_platform_admin()
    or status = 'PUBLISHED'
    or (tenant_id is not null and public._tenant_staff_authorized(auth.uid(), tenant_id))
  );
create policy assessment_definitions_read
  on public.assessment_definitions for select
  using (status = 'PUBLISHED' or public.is_platform_admin());
create policy expert_validation_records_admin_read
  on public.expert_validation_records for select
  using (
    public.is_platform_admin()
    or (tenant_id is not null and public._tenant_staff_authorized(auth.uid(), tenant_id))
  );
create policy training_enrollments_read
  on public.training_enrollments for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
    or exists (
      select 1 from public.students s
       where s.id = training_enrollments.student_id
         and s.tenant_id = training_enrollments.tenant_id
         and s.user_id = auth.uid()
    )
  );
create policy legacy_training_corrections_staff_read
  on public.legacy_training_corrections for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
  );
create policy normalized_readiness_evidence_staff_read
  on public.normalized_readiness_evidence for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
  );
create policy readiness_input_snapshots_staff_read
  on public.readiness_input_snapshots for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
  );
create policy readiness_result_snapshots_staff_read
  on public.readiness_result_snapshots for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
  );
create policy readiness_evaluations_staff_read
  on public.readiness_evaluations for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
  );
create policy assessment_override_policies_staff_read
  on public.assessment_override_policies for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
  );
create policy assessment_records_read
  on public.assessment_records for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
    or (
      status = 'PUBLISHED'
      and exists (
        select 1
          from public.training_enrollments e
          join public.students s
            on s.id = e.student_id and s.tenant_id = e.tenant_id
         where e.id = assessment_records.enrollment_id
           and e.tenant_id = assessment_records.tenant_id
           and s.user_id = auth.uid()
      )
    )
  );
create policy assessment_criterion_results_read
  on public.assessment_criterion_results for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
    or exists (
      select 1
        from public.assessment_records ar
        join public.training_enrollments e
          on e.id = ar.enrollment_id and e.tenant_id = ar.tenant_id
        join public.students s
          on s.id = e.student_id and s.tenant_id = e.tenant_id
       where ar.id = assessment_criterion_results.assessment_record_id
         and ar.tenant_id = assessment_criterion_results.tenant_id
         and ar.status = 'PUBLISHED'
         and s.user_id = auth.uid()
    )
  );
create policy assessment_readiness_decisions_staff_read
  on public.assessment_readiness_decisions for select
  using (
    public.is_platform_admin()
    or public._tenant_staff_authorized(auth.uid(), tenant_id)
  );

grant select on public.curriculum_versions to authenticated, service_role;
grant select on public.readiness_policies to authenticated, service_role;
grant select on public.assessment_definitions to authenticated, service_role;
grant select on public.expert_validation_records to authenticated, service_role;
grant select on public.training_enrollments to authenticated, service_role;
grant select on public.legacy_training_corrections to authenticated, service_role;
grant select on public.normalized_readiness_evidence to authenticated, service_role;
grant select on public.readiness_input_snapshots to authenticated, service_role;
grant select on public.readiness_result_snapshots to authenticated, service_role;
grant select on public.readiness_evaluations to authenticated, service_role;
grant select on public.assessment_override_policies to authenticated, service_role;
grant select on public.assessment_records to authenticated, service_role;
grant select on public.assessment_criterion_results to authenticated, service_role;
grant select on public.assessment_readiness_decisions to authenticated, service_role;

grant insert, update, delete on public.curriculum_versions to service_role;
grant insert, update, delete on public.readiness_policies to service_role;
grant insert, update, delete on public.assessment_definitions to service_role;
grant insert, update, delete on public.expert_validation_records to service_role;
grant insert, update, delete on public.training_enrollments to service_role;
grant insert, update, delete on public.legacy_training_corrections to service_role;
grant insert, update, delete on public.normalized_readiness_evidence to service_role;
grant insert, update, delete on public.readiness_input_snapshots to service_role;
grant insert, update, delete on public.readiness_result_snapshots to service_role;
grant insert, update, delete on public.readiness_evaluations to service_role;
grant insert, update, delete on public.assessment_override_policies to service_role;
grant insert, update, delete on public.assessment_records to service_role;
grant insert, update, delete on public.assessment_criterion_results to service_role;
grant insert, update, delete on public.assessment_readiness_decisions to service_role;

revoke all on function public.create_training_enrollment(
  uuid, uuid, text, uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_training_enrollment(
  uuid, uuid, text, uuid, uuid, timestamptz
) to service_role;
revoke all on function public.record_readiness_evaluation(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text,
  text, text, jsonb, text, text, jsonb, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.record_readiness_evaluation(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text,
  text, text, jsonb, text, text, jsonb, text[], jsonb
) to service_role;
revoke all on function public.create_assessment_retest(
  uuid, uuid, uuid, uuid, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.create_assessment_retest(
  uuid, uuid, uuid, uuid, timestamptz, uuid
) to service_role;

comment on table public.training_enrollments is
  'Canonical training mode: exactly STANDARD, RIS_2_0 or immutable RIS_1_0_LEGACY.';
comment on table public.normalized_readiness_evidence is
  'Append-only normalized evidence. RIS instruction stage is never stored as mastery.';
comment on table public.readiness_input_snapshots is
  'Immutable exact input used by one readiness evaluation.';
comment on table public.readiness_result_snapshots is
  'Immutable result with reason/evidence IDs; contains no exam pass probability.';
comment on table public.assessment_readiness_decisions is
  'Audited readiness decision/override with exact blocker snapshot and optional four-eyes approval.';
