-- ============================================================================
-- RIS lesson card foundation
--
-- Adds a RIS-native lesson card model next to the existing 1..10 skill
-- leskaart. This is intentionally non-destructive: tenants stay on the legacy
-- lesson card until tenant_ris_settings.lesson_card_mode is switched to `ris`.
-- ============================================================================

-- 1. Types -------------------------------------------------------------------
do $$ begin
  create type public.ris_lesson_card_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ris_script_status as enum (
    'not_started',
    'prepared',
    'explained',
    'practiced',
    'needs_attention',
    'progressing',
    'sufficient',
    'independent',
    'mastered',
    'ready_for_test'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ris_module_test_type as enum (
    'instructor_test_1',
    'instructor_test_2',
    'ris_test_cbr',
    'ris_exam_cbr'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ris_module_test_result as enum (
    'planned',
    'passed',
    'failed',
    'needs_repeat',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- 2. Helpers -----------------------------------------------------------------
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

-- 3. Canon catalog -----------------------------------------------------------
create table if not exists public.ris_versions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  active_from  date not null default current_date,
  active_until date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (char_length(name) between 1 and 160),
  check (active_until is null or active_until >= active_from)
);

drop trigger if exists ris_versions_set_updated_at on public.ris_versions;
create trigger ris_versions_set_updated_at
  before update on public.ris_versions
  for each row execute function public.set_updated_at();

create table if not exists public.ris_modules (
  id             uuid primary key default gen_random_uuid(),
  ris_version_id uuid not null references public.ris_versions(id) on delete cascade,
  module_number  smallint not null,
  title          text not null,
  description    text,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (ris_version_id, module_number),
  check (module_number between 1 and 4)
);

alter table public.ris_modules
  drop constraint if exists ris_modules_id_version_unique;
alter table public.ris_modules
  add constraint ris_modules_id_version_unique unique (id, ris_version_id);

drop trigger if exists ris_modules_set_updated_at on public.ris_modules;
create trigger ris_modules_set_updated_at
  before update on public.ris_modules
  for each row execute function public.set_updated_at();

create table if not exists public.ris_categories (
  id            uuid primary key default gen_random_uuid(),
  ris_module_id uuid not null references public.ris_modules(id) on delete cascade,
  title         text not null,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (ris_module_id, title)
);

alter table public.ris_categories
  drop constraint if exists ris_categories_id_module_unique;
alter table public.ris_categories
  add constraint ris_categories_id_module_unique unique (id, ris_module_id);

drop trigger if exists ris_categories_set_updated_at on public.ris_categories;
create trigger ris_categories_set_updated_at
  before update on public.ris_categories
  for each row execute function public.set_updated_at();

create table if not exists public.ris_scripts (
  id                uuid primary key default gen_random_uuid(),
  ris_version_id    uuid not null references public.ris_versions(id) on delete cascade,
  module_id         uuid not null,
  category_id       uuid not null,
  script_number     smallint not null,
  code              text not null,
  title             text not null,
  description_short text,
  sort_order        smallint not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (ris_version_id, code),
  unique (id, ris_version_id),
  constraint ris_scripts_module_version_fkey
    foreign key (module_id, ris_version_id)
    references public.ris_modules (id, ris_version_id)
    on delete cascade,
  constraint ris_scripts_category_module_fkey
    foreign key (category_id, module_id)
    references public.ris_categories (id, ris_module_id)
    on delete cascade,
  check (script_number between 1 and 46),
  check (code ~ '^M[1-4]-S[0-9]+$')
);

drop trigger if exists ris_scripts_set_updated_at on public.ris_scripts;
create trigger ris_scripts_set_updated_at
  before update on public.ris_scripts
  for each row execute function public.set_updated_at();

create table if not exists public.ris_script_variants (
  id         uuid primary key default gen_random_uuid(),
  script_id  uuid not null references public.ris_scripts(id) on delete cascade,
  code       text not null,
  title      text not null,
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_id, code)
);

drop trigger if exists ris_script_variants_set_updated_at on public.ris_script_variants;
create trigger ris_script_variants_set_updated_at
  before update on public.ris_script_variants
  for each row execute function public.set_updated_at();

create table if not exists public.ris_step_definitions (
  id                uuid primary key default gen_random_uuid(),
  ris_version_id    uuid not null references public.ris_versions(id) on delete cascade,
  step_value        text not null,
  instructor_label  text not null,
  student_label     text not null,
  explanation       text not null,
  phase             text not null,
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (ris_version_id, step_value),
  check (public._ris_step_valid(step_value)),
  check (step_value is not null)
);

drop trigger if exists ris_step_definitions_set_updated_at on public.ris_step_definitions;
create trigger ris_step_definitions_set_updated_at
  before update on public.ris_step_definitions
  for each row execute function public.set_updated_at();

-- 4. Tenant setting ----------------------------------------------------------
create table if not exists public.tenant_ris_settings (
  tenant_id             uuid primary key references public.tenants(id) on delete cascade,
  lesson_card_mode      text not null default 'legacy',
  active_ris_version_id uuid references public.ris_versions(id) on delete set null,
  ai_assist_enabled     boolean not null default true,
  updated_by            uuid references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now(),
  check (lesson_card_mode in ('legacy', 'ris'))
);

drop trigger if exists tenant_ris_settings_set_updated_at on public.tenant_ris_settings;
create trigger tenant_ris_settings_set_updated_at
  before update on public.tenant_ris_settings
  for each row execute function public.set_updated_at();

-- 5. Operational RIS lesson card tables -------------------------------------
create table if not exists public.ris_lesson_cards (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  lesson_id                uuid not null references public.lessons(id) on delete cascade,
  student_id               uuid not null,
  instructor_id            uuid not null references auth.users(id) on delete restrict,
  ris_version_id           uuid not null references public.ris_versions(id) on delete restrict,
  publication_status       public.ris_lesson_card_status not null default 'draft',
  internal_summary         text,
  student_friendly_summary text,
  homework_or_next_focus   text,
  published_at             timestamptz,
  published_by             uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (lesson_id),
  unique (id, tenant_id),
  constraint ris_lesson_cards_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade
);

drop trigger if exists ris_lesson_cards_set_updated_at on public.ris_lesson_cards;
create trigger ris_lesson_cards_set_updated_at
  before update on public.ris_lesson_cards
  for each row execute function public.set_updated_at();

create index if not exists idx_ris_lesson_cards_tenant_student
  on public.ris_lesson_cards (tenant_id, student_id, created_at desc);
create index if not exists idx_ris_lesson_cards_tenant_status
  on public.ris_lesson_cards (tenant_id, publication_status, created_at desc);

create table if not exists public.ris_script_assessments (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  student_id           uuid not null,
  lesson_id            uuid not null references public.lessons(id) on delete cascade,
  lesson_card_id       uuid not null,
  script_id            uuid not null references public.ris_scripts(id) on delete restrict,
  script_variant_id    uuid references public.ris_script_variants(id) on delete restrict,
  previous_ris_step    text,
  concept_ris_step     text,
  final_ris_step       text,
  status               public.ris_script_status not null default 'not_started',
  is_attention_point   boolean not null default false,
  is_featured_for_lesson boolean not null default false,
  should_repeat        boolean not null default false,
  ready_for_test       boolean not null default false,
  linked_learning_goal_id uuid,
  instructor_note      text,
  student_visible_note text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (lesson_card_id, script_id),
  constraint ris_script_assessments_card_tenant_fkey
    foreign key (lesson_card_id, tenant_id)
    references public.ris_lesson_cards (id, tenant_id)
    on delete cascade,
  constraint ris_script_assessments_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  check (public._ris_step_valid(previous_ris_step)),
  check (public._ris_step_valid(concept_ris_step)),
  check (public._ris_step_valid(final_ris_step))
);

drop trigger if exists ris_script_assessments_set_updated_at on public.ris_script_assessments;
create trigger ris_script_assessments_set_updated_at
  before update on public.ris_script_assessments
  for each row execute function public.set_updated_at();

create index if not exists idx_ris_script_assessments_student_script
  on public.ris_script_assessments (tenant_id, student_id, script_id, updated_at desc);
create index if not exists idx_ris_script_assessments_card
  on public.ris_script_assessments (lesson_card_id);

create table if not exists public.student_ris_progress (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  student_id               uuid not null,
  script_id                uuid not null references public.ris_scripts(id) on delete restrict,
  script_variant_id         uuid references public.ris_script_variants(id) on delete restrict,
  current_final_step       text,
  last_assessed_lesson_id  uuid references public.lessons(id) on delete set null,
  last_assessed_at         timestamptz,
  is_attention_point       boolean not null default false,
  is_completed             boolean not null default false,
  ready_for_module_test    boolean not null default false,
  updated_at               timestamptz not null default now(),
  unique (tenant_id, student_id, script_id),
  constraint student_ris_progress_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  check (public._ris_step_valid(current_final_step))
);

drop trigger if exists student_ris_progress_set_updated_at on public.student_ris_progress;
create trigger student_ris_progress_set_updated_at
  before update on public.student_ris_progress
  for each row execute function public.set_updated_at();

create index if not exists idx_student_ris_progress_tenant_student
  on public.student_ris_progress (tenant_id, student_id);
create index if not exists idx_student_ris_progress_attention
  on public.student_ris_progress (tenant_id, is_attention_point, ready_for_module_test);

create table if not exists public.ris_lesson_observations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  lesson_card_id     uuid not null,
  lesson_id          uuid not null references public.lessons(id) on delete cascade,
  student_id         uuid not null,
  script_id          uuid references public.ris_scripts(id) on delete set null,
  learning_goal_id   uuid,
  tag                text not null,
  note               text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint ris_lesson_observations_card_tenant_fkey
    foreign key (lesson_card_id, tenant_id)
    references public.ris_lesson_cards (id, tenant_id)
    on delete cascade,
  constraint ris_lesson_observations_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  check (char_length(tag) between 1 and 120),
  check (note is null or char_length(note) <= 1000)
);

create index if not exists idx_ris_lesson_observations_card
  on public.ris_lesson_observations (lesson_card_id, created_at desc);

create table if not exists public.ris_guided_reflections (
  lesson_card_id          uuid primary key,
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  lesson_id               uuid not null references public.lessons(id) on delete cascade,
  student_id              uuid not null,
  reflection_source       text not null default 'guided_end_of_lesson',
  captured_by             uuid references auth.users(id) on delete set null,
  student_present         boolean not null default true,
  rating_overall          smallint,
  rating_independence     smallint,
  went_well_text          text,
  difficult_text          text,
  next_lesson_wish        text,
  instructor_context_note text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint ris_guided_reflections_card_tenant_fkey
    foreign key (lesson_card_id, tenant_id)
    references public.ris_lesson_cards (id, tenant_id)
    on delete cascade,
  constraint ris_guided_reflections_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  check (rating_overall is null or rating_overall between 1 and 8),
  check (rating_independence is null or rating_independence between 1 and 8)
);

drop trigger if exists ris_guided_reflections_set_updated_at on public.ris_guided_reflections;
create trigger ris_guided_reflections_set_updated_at
  before update on public.ris_guided_reflections
  for each row execute function public.set_updated_at();

create table if not exists public.ris_module_tests (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants(id) on delete cascade,
  student_id                      uuid not null,
  module_number                   smallint not null,
  test_type                       public.ris_module_test_type not null,
  planned_at                      timestamptz,
  completed_at                    timestamptz,
  result                          public.ris_module_test_result not null default 'planned',
  instructor_id                   uuid references auth.users(id) on delete set null,
  cbr_reference                   text,
  notes                           text,
  exemption_special_manoeuvres    boolean not null default false,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint ris_module_tests_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  check (module_number between 1 and 4)
);

drop trigger if exists ris_module_tests_set_updated_at on public.ris_module_tests;
create trigger ris_module_tests_set_updated_at
  before update on public.ris_module_tests
  for each row execute function public.set_updated_at();

create index if not exists idx_ris_module_tests_tenant_student
  on public.ris_module_tests (tenant_id, student_id, module_number, planned_at desc);

-- 6. RLS ---------------------------------------------------------------------
alter table public.ris_versions enable row level security;
alter table public.ris_modules enable row level security;
alter table public.ris_categories enable row level security;
alter table public.ris_scripts enable row level security;
alter table public.ris_script_variants enable row level security;
alter table public.ris_step_definitions enable row level security;
alter table public.tenant_ris_settings enable row level security;
alter table public.ris_lesson_cards enable row level security;
alter table public.ris_script_assessments enable row level security;
alter table public.student_ris_progress enable row level security;
alter table public.ris_lesson_observations enable row level security;
alter table public.ris_guided_reflections enable row level security;
alter table public.ris_module_tests enable row level security;

drop policy if exists ris_catalog_select_authenticated on public.ris_versions;
create policy ris_catalog_select_authenticated on public.ris_versions
  for select using (auth.uid() is not null or public.is_platform_admin());
drop policy if exists ris_modules_select_authenticated on public.ris_modules;
create policy ris_modules_select_authenticated on public.ris_modules
  for select using (auth.uid() is not null or public.is_platform_admin());
drop policy if exists ris_categories_select_authenticated on public.ris_categories;
create policy ris_categories_select_authenticated on public.ris_categories
  for select using (auth.uid() is not null or public.is_platform_admin());
drop policy if exists ris_scripts_select_authenticated on public.ris_scripts;
create policy ris_scripts_select_authenticated on public.ris_scripts
  for select using (auth.uid() is not null or public.is_platform_admin());
drop policy if exists ris_script_variants_select_authenticated on public.ris_script_variants;
create policy ris_script_variants_select_authenticated on public.ris_script_variants
  for select using (auth.uid() is not null or public.is_platform_admin());
drop policy if exists ris_step_definitions_select_authenticated on public.ris_step_definitions;
create policy ris_step_definitions_select_authenticated on public.ris_step_definitions
  for select using (auth.uid() is not null or public.is_platform_admin());

drop policy if exists tenant_ris_settings_select_members on public.tenant_ris_settings;
create policy tenant_ris_settings_select_members on public.tenant_ris_settings
  for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

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
      publication_status = 'published'
      and student_id in (
        select s.id from public.students s
         where s.user_id = auth.uid()
           and s.tenant_id = ris_lesson_cards.tenant_id
      )
    )
    or (
      publication_status = 'published'
      and student_id in (
        select g.student_id from public.student_guardians g
         where g.user_id = auth.uid()
           and g.tenant_id = ris_lesson_cards.tenant_id
      )
    )
  );

drop policy if exists ris_script_assessments_select_members on public.ris_script_assessments;
create policy ris_script_assessments_select_members on public.ris_script_assessments
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
         and c.publication_status = 'published'
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

drop policy if exists student_ris_progress_select_members on public.student_ris_progress;
create policy student_ris_progress_select_members on public.student_ris_progress
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = student_ris_progress.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id from public.students s
       where s.user_id = auth.uid()
         and s.tenant_id = student_ris_progress.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id = auth.uid()
         and g.tenant_id = student_ris_progress.tenant_id
    )
  );

drop policy if exists ris_lesson_observations_select_staff on public.ris_lesson_observations;
create policy ris_lesson_observations_select_staff on public.ris_lesson_observations
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = ris_lesson_observations.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  );

drop policy if exists ris_guided_reflections_select_staff on public.ris_guided_reflections;
create policy ris_guided_reflections_select_staff on public.ris_guided_reflections
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = ris_guided_reflections.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  );

drop policy if exists ris_module_tests_select_members on public.ris_module_tests;
create policy ris_module_tests_select_members on public.ris_module_tests
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = ris_module_tests.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id from public.students s
       where s.user_id = auth.uid()
         and s.tenant_id = ris_module_tests.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id = auth.uid()
         and g.tenant_id = ris_module_tests.tenant_id
    )
  );

-- 7. Seed RIS canon ----------------------------------------------------------
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

  insert into public.ris_modules (ris_version_id, module_number, title, description, sort_order)
  values
    (v_version_id, 1, 'Voertuigbeheersing', 'Technische bediening en controle van de auto.', 10),
    (v_version_id, 2, 'Eenvoudige verkeerssituaties', 'Basis verkeersdeelname en bijzondere verrichtingen.', 20),
    (v_version_id, 3, 'Complexe verkeerssituaties', 'Zelfstandiger handelen in complexere verkeerssituaties.', 30),
    (v_version_id, 4, 'Verantwoord rijgedrag', 'Veilig, verantwoord en zelfstandig rijden.', 40)
  on conflict (ris_version_id, module_number) do update
    set title = excluded.title,
        description = excluded.description,
        sort_order = excluded.sort_order;

  insert into public.ris_categories (ris_module_id, title, sort_order)
  select m.id, v.title, v.sort_order
    from (values
      (1, 'Controle', 10),
      (1, 'Bediening', 20),
      (2, 'Eenvoudige verkeerssituaties', 10),
      (2, 'Bijzondere verrichtingen', 20),
      (3, 'Verplaatsing', 10),
      (3, 'Bijzondere weggedeelten', 20),
      (4, 'Verantwoord rijgedrag', 10)
    ) as v(module_number, title, sort_order)
    join public.ris_modules m
      on m.ris_version_id = v_version_id
     and m.module_number = v.module_number
  on conflict (ris_module_id, title) do update
    set sort_order = excluded.sort_order;

  insert into public.ris_scripts (
    ris_version_id, module_id, category_id, script_number, code, title, description_short, sort_order
  )
  select v_version_id, m.id, c.id, v.script_number, v.code, v.title, v.description_short, v.script_number
    from (values
      (1, 'Controle', 1, 'M1-S1', 'Controle buiten de auto', 'Buitencontrole voor vertrek.'),
      (1, 'Controle', 2, 'M1-S2', 'Controle in de auto', 'Binnencontrole voor vertrek.'),
      (1, 'Controle', 3, 'M1-S3', 'Instappen', 'Veilig instappen en voorbereiden.'),
      (1, 'Controle', 4, 'M1-S4', 'Uitstappen', 'Veilig uitstappen en afsluiten.'),
      (1, 'Controle', 5, 'M1-S5', 'Zithouding', 'Juiste zithouding en bediening.'),
      (1, 'Controle', 6, 'M1-S6', 'Stuurhouding', 'Juiste hand- en stuurhouding.'),
      (1, 'Controle', 7, 'M1-S7', 'Afstellen spiegels', 'Spiegels correct instellen.'),
      (1, 'Bediening', 8, 'M1-S8', 'Starten en afzetten', 'Voertuig gecontroleerd starten en afzetten.'),
      (1, 'Bediening', 9, 'M1-S9', 'Gas geven', 'Gedoseerd accelereren.'),
      (1, 'Bediening', 10, 'M1-S10', 'Scan', 'Kijk- en verkeersscan opbouwen.'),
      (1, 'Bediening', 11, 'M1-S11', 'Sturen', 'Stuurtechniek toepassen.'),
      (1, 'Bediening', 12, 'M1-S12', 'Positie', 'Positie op de weg aanhouden.'),
      (1, 'Bediening', 13, 'M1-S13', 'Remmen', 'Gedoseerd en veilig remmen.'),
      (1, 'Bediening', 14, 'M1-S14', 'Ontkoppelen', 'Koppeling correct gebruiken.'),
      (1, 'Bediening', 15, 'M1-S15', 'Stoppen', 'Gecontroleerd stoppen.'),
      (1, 'Bediening', 16, 'M1-S16', 'Koppelen', 'Koppelen en aangrijppunt beheersen.'),
      (1, 'Bediening', 17, 'M1-S17', 'Schakelen', 'Schakelen op passend moment.'),
      (1, 'Bediening', 18, 'M1-S18', 'Technische wijze wegrijden', 'Technisch correct wegrijden.'),
      (2, 'Eenvoudige verkeerssituaties', 19, 'M2-S19', 'Wegrijden en stoppen', 'Wegrijden en stoppen in verkeer.'),
      (2, 'Eenvoudige verkeerssituaties', 20, 'M2-S20', 'Volgafstand', 'Veilige volgafstand houden.'),
      (2, 'Eenvoudige verkeerssituaties', 21, 'M2-S21', 'Ruimtekussen', 'Ruimte rondom het voertuig bewaken.'),
      (2, 'Eenvoudige verkeerssituaties', 22, 'M2-S22', 'Tegemoetkomen', 'Tegemoetkomend verkeer verwerken.'),
      (2, 'Eenvoudige verkeerssituaties', 23, 'M2-S23', 'Ingehaald worden', 'Veilig gedrag bij ingehaald worden.'),
      (2, 'Eenvoudige verkeerssituaties', 24, 'M2-S24', 'Kruispunten', 'Eenvoudige kruispunten veilig benaderen.'),
      (2, 'Eenvoudige verkeerssituaties', 25, 'M2-S25', 'Afslaan', 'Afslaan met juiste kijk- en plaatsingsroutine.'),
      (2, 'Bijzondere verrichtingen', 26, 'M2-S26', 'Hellingproef', 'Wegrijden op een helling.'),
      (2, 'Bijzondere verrichtingen', 27, 'M2-S27', 'Achteruitrijden', 'Achteruitrijden in basisvormen.'),
      (2, 'Bijzondere verrichtingen', 28, 'M2-S28', 'Parkeren', 'Parkeren in verschillende situaties.'),
      (2, 'Bijzondere verrichtingen', 29, 'M2-S29', 'Omkeren', 'Omkeren in passende vorm.'),
      (3, 'Verplaatsing', 30, 'M3-S30', 'Rijstrook wisselen en zijdelings verplaatsen', 'Veilig van positie of rijstrook wisselen.'),
      (3, 'Verplaatsing', 31, 'M3-S31', 'Voorbijgaan', 'Veilig voorbijgaan aan obstakels.'),
      (3, 'Verplaatsing', 32, 'M3-S32', 'Inhalen', 'Inhalen voorbereiden en uitvoeren.'),
      (3, 'Verplaatsing', 33, 'M3-S33', 'Invoegen', 'Veilig invoegen.'),
      (3, 'Verplaatsing', 34, 'M3-S34', 'Uitvoegen', 'Veilig uitvoegen.'),
      (3, 'Bijzondere weggedeelten', 35, 'M3-S35', 'Rotondes', 'Rotondes benaderen en berijden.'),
      (3, 'Bijzondere weggedeelten', 36, 'M3-S36', 'Erven', 'Rijden op erven en verblijfsgebieden.'),
      (3, 'Bijzondere weggedeelten', 37, 'M3-S37', 'Spoorwegovergangen', 'Spoorwegovergangen veilig passeren.'),
      (3, 'Bijzondere weggedeelten', 38, 'M3-S38', 'Voetgangersoversteekplaatsen, VOP', 'VOP herkennen en veilig handelen.'),
      (3, 'Bijzondere weggedeelten', 39, 'M3-S39', 'Tram- en bushaltes', 'Haltesituaties veilig verwerken.'),
      (4, 'Verantwoord rijgedrag', 40, 'M4-S40', 'Moeilijke omstandigheden', 'Rijden bij lastige omstandigheden.'),
      (4, 'Verantwoord rijgedrag', 41, 'M4-S41', 'Zelfstandige ritvoorbereiding', 'Zelfstandig ritten voorbereiden.'),
      (4, 'Verantwoord rijgedrag', 42, 'M4-S42', 'ROSO-training, rijden onder specifieke omstandigheden', 'Specifieke omstandigheden veilig toepassen.'),
      (4, 'Verantwoord rijgedrag', 43, 'M4-S43', 'Milieuverantwoord rijden', 'Milieubewust en verantwoord rijden.'),
      (4, 'Verantwoord rijgedrag', 44, 'M4-S44', 'Defensief rijden', 'Defensief, voorspelbaar en veilig rijden.'),
      (4, 'Verantwoord rijgedrag', 45, 'M4-S45', 'Aangepast en besluitvaardig rijden', 'Aangepast en besluitvaardig handelen.'),
      (4, 'Verantwoord rijgedrag', 46, 'M4-S46', 'Mentaliteit en verantwoordelijkheid', 'Verantwoordelijkheid en rijhouding tonen.')
    ) as v(module_number, category_title, script_number, code, title, description_short)
    join public.ris_modules m
      on m.ris_version_id = v_version_id
     and m.module_number = v.module_number
    join public.ris_categories c
      on c.ris_module_id = m.id
     and c.title = v.category_title
  on conflict (ris_version_id, code) do update
    set title = excluded.title,
        description_short = excluded.description_short,
        module_id = excluded.module_id,
        category_id = excluded.category_id,
        script_number = excluded.script_number,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into public.ris_script_variants (script_id, code, title, sort_order)
  select s.id, v.variant_code, v.title, v.sort_order
    from (values
      ('M2-S27', 'M2-S27a', 'Achteruitrijden, rechte lijn', 10),
      ('M2-S27', 'M2-S27b', 'Achteruitrijden, aangegeven bocht', 20),
      ('M2-S29', 'M2-S29a', 'Omkeren, halve draai', 10),
      ('M2-S29', 'M2-S29b', 'Omkeren, steken', 20)
    ) as v(script_code, variant_code, title, sort_order)
    join public.ris_scripts s
      on s.ris_version_id = v_version_id
     and s.code = v.script_code
  on conflict (script_id, code) do update
    set title = excluded.title,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into public.ris_step_definitions (
    ris_version_id, step_value, instructor_label, student_label, explanation, phase, sort_order
  )
  values
    (v_version_id, 'N', 'Niet beoordeeld', 'Nog niet beoordeeld', 'Er is nog geen betrouwbare beoordeling vastgelegd.', 'geen score', 0),
    (v_version_id, '1', 'Kennismaken', 'Je maakt kennis met dit onderdeel', 'De leerling weet nog niet goed wat het onderdeel inhoudt.', 'cognitief', 10),
    (v_version_id, '2', 'Uitleg begrijpen', 'Je begrijpt de uitleg steeds beter', 'De leerling begrijpt de theorie, maar voert nog niet zelfstandig uit.', 'cognitief', 20),
    (v_version_id, '3', 'Met veel begeleiding', 'Je oefent dit met veel hulp', 'De leerling voert uit met veel aanwijzingen.', 'cognitief', 30),
    (v_version_id, '4', 'Begin uitvoering', 'Je voert dit al deels zelf uit', 'De leerling voert uit maar maakt nog regelmatig fouten.', 'associatief', 40),
    (v_version_id, '5', 'Bijna zelfstandig', 'Je doet dit bijna zelfstandig', 'De leerling heeft nog weinig aanwijzingen nodig.', 'associatief', 50),
    (v_version_id, '6', 'Zelfstandig uitvoeren', 'Je kunt dit zelfstandig uitvoeren', 'De leerling voert het onderdeel zelfstandig uit zonder aanwijzingen.', 'associatief', 60),
    (v_version_id, '7', 'Toepassen in gewijzigde situaties', 'Je past dit toe in andere situaties', 'De leerling herhaalt het onderdeel in gewijzigde omstandigheden.', 'geautomatiseerd', 70),
    (v_version_id, '8', 'Geautomatiseerd in wisselende situaties', 'Je beheerst dit in wisselende situaties', 'De leerling past het onderdeel zelfstandig toe in wisselende situaties.', 'geautomatiseerd', 80)
  on conflict (ris_version_id, step_value) do update
    set instructor_label = excluded.instructor_label,
        student_label = excluded.student_label,
        explanation = excluded.explanation,
        phase = excluded.phase,
        sort_order = excluded.sort_order;

  return v_version_id;
end;
$$;

-- Public wrapper is service-role only; migrations and maintenance scripts can
-- call it without knowing the private helper name.
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

-- 8. Settings provisioning ---------------------------------------------------
create or replace function public._provision_ris_settings_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
begin
  v_version_id := public._insert_default_ris_taxonomy();
  insert into public.tenant_ris_settings (tenant_id, lesson_card_mode, active_ris_version_id)
  values (new.id, 'legacy', v_version_id)
  on conflict (tenant_id) do nothing;

  insert into public.tenant_settings (tenant_id, key, value)
  values (new.id, 'lesson_card_mode', jsonb_build_object('mode', 'legacy'))
  on conflict (tenant_id, key) do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_provision_ris_settings on public.tenants;
create trigger tenants_provision_ris_settings
  after insert on public.tenants
  for each row execute function public._provision_ris_settings_for_tenant();

-- Backfill catalog + settings for existing tenants.
do $$
declare
  v_version_id uuid;
begin
  v_version_id := public._insert_default_ris_taxonomy();
  insert into public.tenant_ris_settings (tenant_id, lesson_card_mode, active_ris_version_id)
  select id, 'legacy', v_version_id from public.tenants
  on conflict (tenant_id) do nothing;

  insert into public.tenant_settings (tenant_id, key, value)
  select id, 'lesson_card_mode', jsonb_build_object('mode', 'legacy') from public.tenants
  on conflict (tenant_id, key) do nothing;
end $$;

-- 9. Operational RPCs --------------------------------------------------------
create or replace function public.set_tenant_ris_settings(
  p_tenant_id uuid,
  p_actor uuid,
  p_lesson_card_mode text,
  p_active_ris_version_id uuid,
  p_ai_assist_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := coalesce(nullif(trim(p_lesson_card_mode), ''), 'legacy');
  v_version uuid;
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage RIS settings for tenant %', p_actor, p_tenant_id;
  end if;
  if v_mode not in ('legacy', 'ris') then
    raise exception 'invalid lesson_card_mode %', v_mode;
  end if;
  v_version := coalesce(p_active_ris_version_id, public._insert_default_ris_taxonomy());
  if not exists (select 1 from public.ris_versions where id = v_version and is_active = true) then
    raise exception 'RIS version % not found or inactive', v_version;
  end if;

  insert into public.tenant_ris_settings (
    tenant_id, lesson_card_mode, active_ris_version_id, ai_assist_enabled, updated_by
  ) values (
    p_tenant_id, v_mode, v_version, coalesce(p_ai_assist_enabled, true), p_actor
  )
  on conflict (tenant_id) do update
    set lesson_card_mode = excluded.lesson_card_mode,
        active_ris_version_id = excluded.active_ris_version_id,
        ai_assist_enabled = excluded.ai_assist_enabled,
        updated_by = p_actor;

  insert into public.tenant_settings (tenant_id, key, value)
  values (p_tenant_id, 'lesson_card_mode', jsonb_build_object('mode', v_mode))
  on conflict (tenant_id, key) do update
    set value = excluded.value;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.settings_set', 'tenant', p_tenant_id::text,
    jsonb_build_object('lesson_card_mode', v_mode, 'active_ris_version_id', v_version)
  );
end;
$$;

create or replace function public._ensure_ris_lesson_card(
  p_tenant_id uuid,
  p_lesson_id uuid,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson public.lessons%rowtype;
  v_settings public.tenant_ris_settings%rowtype;
  v_card_id uuid;
begin
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

  select * into v_settings
    from public.tenant_ris_settings
   where tenant_id = p_tenant_id;
  if v_settings.tenant_id is null then
    insert into public.tenant_ris_settings (tenant_id, lesson_card_mode)
    values (p_tenant_id, 'legacy')
    returning * into v_settings;
  end if;

  if coalesce(v_settings.lesson_card_mode, 'legacy') <> 'ris' then
    raise exception 'RIS lesson card mode is not enabled for tenant %', p_tenant_id;
  end if;

  if v_settings.active_ris_version_id is null then
    v_settings.active_ris_version_id := public._insert_default_ris_taxonomy();
    update public.tenant_ris_settings
       set active_ris_version_id = v_settings.active_ris_version_id,
           updated_at = timezone('utc', now())
     where tenant_id = p_tenant_id;
  end if;

  insert into public.ris_lesson_cards (
    tenant_id, lesson_id, student_id, instructor_id, ris_version_id
  ) values (
    p_tenant_id,
    p_lesson_id,
    v_lesson.student_id,
    v_lesson.instructor_id,
    coalesce(v_settings.active_ris_version_id, public._insert_default_ris_taxonomy())
  )
  on conflict (lesson_id) do update
    set instructor_id = excluded.instructor_id
  returning id into v_card_id;

  return v_card_id;
end;
$$;

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
       and publication_status <> 'draft'
  ) then
    raise exception 'RIS lesson card % is already published or archived', v_card_id;
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

create or replace function public.set_guided_reflection(
  p_lesson_card_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_student_present boolean,
  p_rating_overall smallint,
  p_rating_independence smallint,
  p_went_well_text text,
  p_difficult_text text,
  p_next_lesson_wish text,
  p_instructor_context_note text
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
  if v_card.publication_status <> 'draft' then
    raise exception 'RIS lesson card % is already published or archived', p_lesson_card_id;
  end if;

  insert into public.ris_guided_reflections (
    lesson_card_id, tenant_id, lesson_id, student_id, captured_by, student_present,
    rating_overall, rating_independence, went_well_text, difficult_text,
    next_lesson_wish, instructor_context_note
  ) values (
    p_lesson_card_id, p_tenant_id, v_card.lesson_id, v_card.student_id, p_actor,
    coalesce(p_student_present, true), p_rating_overall, p_rating_independence,
    nullif(trim(coalesce(p_went_well_text, '')), ''),
    nullif(trim(coalesce(p_difficult_text, '')), ''),
    nullif(trim(coalesce(p_next_lesson_wish, '')), ''),
    nullif(trim(coalesce(p_instructor_context_note, '')), '')
  )
  on conflict (lesson_card_id) do update
    set captured_by = p_actor,
        student_present = coalesce(p_student_present, true),
        rating_overall = p_rating_overall,
        rating_independence = p_rating_independence,
        went_well_text = nullif(trim(coalesce(p_went_well_text, '')), ''),
        difficult_text = nullif(trim(coalesce(p_difficult_text, '')), ''),
        next_lesson_wish = nullif(trim(coalesce(p_next_lesson_wish, '')), ''),
        instructor_context_note = nullif(trim(coalesce(p_instructor_context_note, '')), '');

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.guided_reflection_set', 'ris_lesson_card', p_lesson_card_id::text,
    jsonb_build_object('student_present', coalesce(p_student_present, true))
  );
end;
$$;

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
    and c.publication_status = 'published'
    and a.final_ris_step is not null
  order by a.script_id, l.starts_at desc, a.updated_at desc;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.progress_recomputed', 'student', p_student_id::text, '{}'::jsonb
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
  if v_card.publication_status <> 'draft' then
    raise exception 'RIS lesson card % is already published or archived', p_lesson_card_id;
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

  update public.ris_script_assessments
     set final_ris_step = concept_ris_step
   where lesson_card_id = p_lesson_card_id
     and tenant_id = p_tenant_id
     and concept_ris_step is not null;

  update public.ris_lesson_cards
     set publication_status = 'published',
         internal_summary = nullif(trim(coalesce(p_internal_summary, '')), ''),
         student_friendly_summary = nullif(trim(coalesce(p_student_friendly_summary, '')), ''),
         homework_or_next_focus = nullif(trim(coalesce(p_homework_or_next_focus, '')), ''),
         published_at = now(),
         published_by = p_actor
   where id = p_lesson_card_id and tenant_id = p_tenant_id;

  perform public.recompute_student_ris_progress(p_tenant_id, v_card.student_id, p_actor);

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.lesson_card_published', 'ris_lesson_card', p_lesson_card_id::text,
    jsonb_build_object('lesson_id', v_card.lesson_id, 'student_id', v_card.student_id)
  );
end;
$$;

create or replace function public.set_ris_module_test(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_student_id uuid,
  p_module_number smallint,
  p_test_type public.ris_module_test_type,
  p_planned_at timestamptz,
  p_completed_at timestamptz,
  p_result public.ris_module_test_result,
  p_instructor_id uuid,
  p_cbr_reference text,
  p_notes text,
  p_exemption_special_manoeuvres boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (select 1 from public.students where id = p_student_id and tenant_id = p_tenant_id) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  if p_id is null then
    insert into public.ris_module_tests (
      tenant_id, student_id, module_number, test_type, planned_at, completed_at,
      result, instructor_id, cbr_reference, notes, exemption_special_manoeuvres
    ) values (
      p_tenant_id, p_student_id, p_module_number, p_test_type, p_planned_at, p_completed_at,
      coalesce(p_result, 'planned'), p_instructor_id,
      nullif(trim(coalesce(p_cbr_reference, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_exemption_special_manoeuvres, false)
    )
    returning id into v_id;
  else
    update public.ris_module_tests
       set student_id = p_student_id,
           module_number = p_module_number,
           test_type = p_test_type,
           planned_at = p_planned_at,
           completed_at = p_completed_at,
           result = coalesce(p_result, 'planned'),
           instructor_id = p_instructor_id,
           cbr_reference = nullif(trim(coalesce(p_cbr_reference, '')), ''),
           notes = nullif(trim(coalesce(p_notes, '')), ''),
           exemption_special_manoeuvres = coalesce(p_exemption_special_manoeuvres, false)
     where id = p_id and tenant_id = p_tenant_id
     returning id into v_id;
    if v_id is null then
      raise exception 'RIS module test % not found in tenant %', p_id, p_tenant_id;
    end if;
  end if;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.module_test_set', 'ris_module_test', v_id::text,
    jsonb_build_object('student_id', p_student_id, 'module_number', p_module_number, 'test_type', p_test_type)
  );

  return v_id;
end;
$$;

-- 10. Lock down RPCs ---------------------------------------------------------
revoke all on function public._ris_step_numeric(text) from public;
grant execute on function public._ris_step_numeric(text) to anon, authenticated, service_role;
revoke all on function public._ris_step_valid(text) from public;
grant execute on function public._ris_step_valid(text) to anon, authenticated, service_role;

grant select on public.ris_versions to authenticated, service_role;
grant select on public.ris_modules to authenticated, service_role;
grant select on public.ris_categories to authenticated, service_role;
grant select on public.ris_scripts to authenticated, service_role;
grant select on public.ris_script_variants to authenticated, service_role;
grant select on public.ris_step_definitions to authenticated, service_role;
grant select on public.tenant_ris_settings to authenticated, service_role;
grant select on public.ris_lesson_cards to authenticated, service_role;
grant select on public.ris_script_assessments to authenticated, service_role;
grant select on public.student_ris_progress to authenticated, service_role;
grant select on public.ris_lesson_observations to authenticated, service_role;
grant select on public.ris_guided_reflections to authenticated, service_role;
grant select on public.ris_module_tests to authenticated, service_role;

grant insert, update, delete on public.tenant_ris_settings to service_role;
grant insert, update, delete on public.ris_lesson_cards to service_role;
grant insert, update, delete on public.ris_script_assessments to service_role;
grant insert, update, delete on public.student_ris_progress to service_role;
grant insert, update, delete on public.ris_lesson_observations to service_role;
grant insert, update, delete on public.ris_guided_reflections to service_role;
grant insert, update, delete on public.ris_module_tests to service_role;

revoke all on function public._insert_default_ris_taxonomy() from public;
revoke execute on function public._insert_default_ris_taxonomy() from anon, authenticated;
grant execute on function public._insert_default_ris_taxonomy() to service_role;

revoke all on function public.seed_default_ris_taxonomy() from public;
revoke execute on function public.seed_default_ris_taxonomy() from anon, authenticated;
grant execute on function public.seed_default_ris_taxonomy() to service_role;

revoke all on function public._provision_ris_settings_for_tenant() from public;
revoke execute on function public._provision_ris_settings_for_tenant() from anon, authenticated;
grant execute on function public._provision_ris_settings_for_tenant() to service_role;

revoke all on function public.set_tenant_ris_settings(uuid, uuid, text, uuid, boolean) from public;
revoke execute on function public.set_tenant_ris_settings(uuid, uuid, text, uuid, boolean) from anon, authenticated;
grant execute on function public.set_tenant_ris_settings(uuid, uuid, text, uuid, boolean) to service_role;

revoke all on function public._ensure_ris_lesson_card(uuid, uuid, uuid) from public;
revoke execute on function public._ensure_ris_lesson_card(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._ensure_ris_lesson_card(uuid, uuid, uuid) to service_role;

revoke all on function public.set_ris_concept_score(uuid, uuid, uuid, uuid, uuid, text, public.ris_script_status, boolean, boolean, boolean, boolean, text, text) from public;
revoke execute on function public.set_ris_concept_score(uuid, uuid, uuid, uuid, uuid, text, public.ris_script_status, boolean, boolean, boolean, boolean, text, text) from anon, authenticated;
grant execute on function public.set_ris_concept_score(uuid, uuid, uuid, uuid, uuid, text, public.ris_script_status, boolean, boolean, boolean, boolean, text, text) to service_role;

revoke all on function public.set_guided_reflection(uuid, uuid, uuid, boolean, smallint, smallint, text, text, text, text) from public;
revoke execute on function public.set_guided_reflection(uuid, uuid, uuid, boolean, smallint, smallint, text, text, text, text) from anon, authenticated;
grant execute on function public.set_guided_reflection(uuid, uuid, uuid, boolean, smallint, smallint, text, text, text, text) to service_role;

revoke all on function public.recompute_student_ris_progress(uuid, uuid, uuid) from public;
revoke execute on function public.recompute_student_ris_progress(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.recompute_student_ris_progress(uuid, uuid, uuid) to service_role;

revoke all on function public.publish_ris_lesson_card(uuid, uuid, uuid, text, text, text) from public;
revoke execute on function public.publish_ris_lesson_card(uuid, uuid, uuid, text, text, text) from anon, authenticated;
grant execute on function public.publish_ris_lesson_card(uuid, uuid, uuid, text, text, text) to service_role;

revoke all on function public.set_ris_module_test(uuid, uuid, uuid, uuid, smallint, public.ris_module_test_type, timestamptz, timestamptz, public.ris_module_test_result, uuid, text, text, boolean) from public;
revoke execute on function public.set_ris_module_test(uuid, uuid, uuid, uuid, smallint, public.ris_module_test_type, timestamptz, timestamptz, public.ris_module_test_result, uuid, text, text, boolean) from anon, authenticated;
grant execute on function public.set_ris_module_test(uuid, uuid, uuid, uuid, smallint, public.ris_module_test_type, timestamptz, timestamptz, public.ris_module_test_result, uuid, text, text, boolean) to service_role;
