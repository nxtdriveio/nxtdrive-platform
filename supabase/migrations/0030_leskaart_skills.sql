-- ============================================================================
-- 0030_leskaart_skills.sql
--
-- Leskaart L0 — hierarchical skill taxonomy + 1..10 score model (datalaag).
--
-- Canon: docs/NXTDRIVE_LESKAART_CANON.md. The leskaart is the full training
-- dossier, not a checklist. A skill is graded 1..10 per lesson; readiness is
-- derived from those grades (L1). This migration introduces ONLY the data
-- layer:
--
--   * skill_taxonomy          — tenant-scoped 3-level tree
--                               (hoofdcategorie -> subcategorie -> vaardigheid),
--                               with a "kritieke veiligheidsvaardigheid" flag,
--                               an optional theory link and soft-delete/version
--                               so running dossiers stay stable.
--   * lesson_skill_scores     — per-lesson grade history (1..10) per leaf skill.
--   * student_skill_scores    — rollup of the latest grade per (student, skill).
--
-- Writes go through SECURITY DEFINER RPCs only (service role):
--   * set_skill_score(...)            — grade one leaf skill on one lesson.
--   * seed_default_skill_taxonomy(...) — actor-gated re-seed + audit.
--   * _insert_default_skill_taxonomy(...) — internal idempotent canon seed.
-- Reads are RLS-enforced, mirroring the cbr_checklist visibility model.
--
-- NOTE: the legacy flat cbr_competencies / student_cbr_progress tables (0022)
-- are intentionally LEFT IN PLACE. The live instructor/student UI still uses
-- them; L2/L3 migrate the UI onto this model, after which the flat tables can
-- be deprecated. This keeps L0 non-breaking.
-- ============================================================================

-- 1. skill_taxonomy ----------------------------------------------------------
create table if not exists public.skill_taxonomy (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  parent_id   uuid,
  level       smallint not null,            -- 1=hoofdcategorie, 2=subcategorie, 3=vaardigheid
  code        text not null,                -- dotted, globally unique per tenant
  label       text not null,
  sort_order  smallint not null default 0,
  is_critical boolean not null default false, -- kritieke veiligheidsvaardigheid (leaf-only)
  theory_link text,                          -- optional koppeling, e.g. 'Rotondes & Voorrang'
  active      boolean not null default true, -- soft-delete; never hard-delete a graded skill
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (level between 1 and 3),
  check (char_length(code) between 1 and 160),
  check (char_length(label) between 1 and 200),
  unique (tenant_id, code)
);

-- Composite unique so children + score rows can FK on (id, tenant_id).
alter table public.skill_taxonomy
  drop constraint if exists skill_taxonomy_id_tenant_unique;
alter table public.skill_taxonomy
  add constraint skill_taxonomy_id_tenant_unique unique (id, tenant_id);

-- Self-referential, tenant-consistent parent FK (skipped for level-1 nulls).
alter table public.skill_taxonomy
  drop constraint if exists skill_taxonomy_parent_tenant_fkey;
alter table public.skill_taxonomy
  add constraint skill_taxonomy_parent_tenant_fkey
    foreign key (parent_id, tenant_id)
    references public.skill_taxonomy (id, tenant_id)
    on delete cascade;

drop trigger if exists skill_taxonomy_set_updated_at on public.skill_taxonomy;
create trigger skill_taxonomy_set_updated_at
  before update on public.skill_taxonomy
  for each row execute function public.set_updated_at();

create index if not exists idx_skill_taxonomy_tenant_parent_sort
  on public.skill_taxonomy (tenant_id, parent_id, sort_order, label);
create index if not exists idx_skill_taxonomy_tenant_level
  on public.skill_taxonomy (tenant_id, level, sort_order);

alter table public.skill_taxonomy enable row level security;
drop policy if exists skill_taxonomy_select_members on public.skill_taxonomy;
create policy skill_taxonomy_select_members on public.skill_taxonomy
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
-- no insert/update/delete policies — writes go through RPCs (service role)

-- 2. lesson_skill_scores (per-lesson grade history) --------------------------
create table if not exists public.lesson_skill_scores (
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  student_id  uuid not null,
  skill_id    uuid not null,
  score       smallint not null,
  scored_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (lesson_id, skill_id),
  check (score between 1 and 10),
  constraint lesson_skill_scores_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id) on delete cascade,
  constraint lesson_skill_scores_skill_tenant_fkey
    foreign key (skill_id, tenant_id)
    references public.skill_taxonomy (id, tenant_id) on delete cascade
);

drop trigger if exists lesson_skill_scores_set_updated_at on public.lesson_skill_scores;
create trigger lesson_skill_scores_set_updated_at
  before update on public.lesson_skill_scores
  for each row execute function public.set_updated_at();

create index if not exists idx_lesson_skill_scores_student_skill
  on public.lesson_skill_scores (student_id, skill_id);
create index if not exists idx_lesson_skill_scores_tenant
  on public.lesson_skill_scores (tenant_id);

alter table public.lesson_skill_scores enable row level security;
drop policy if exists lesson_skill_scores_select_members on public.lesson_skill_scores;
create policy lesson_skill_scores_select_members on public.lesson_skill_scores
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = lesson_skill_scores.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id from public.students s
       where s.user_id = auth.uid() and s.tenant_id = lesson_skill_scores.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id = auth.uid() and g.tenant_id = lesson_skill_scores.tenant_id
    )
  );

-- 3. student_skill_scores (rollup of the latest grade) -----------------------
create table if not exists public.student_skill_scores (
  student_id     uuid not null,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  skill_id       uuid not null,
  score          smallint not null,
  last_lesson_id uuid references public.lessons(id) on delete set null,
  scored_at      timestamptz not null default now(),
  scored_by      uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (student_id, skill_id),
  check (score between 1 and 10),
  constraint student_skill_scores_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id) on delete cascade,
  constraint student_skill_scores_skill_tenant_fkey
    foreign key (skill_id, tenant_id)
    references public.skill_taxonomy (id, tenant_id) on delete cascade
);

drop trigger if exists student_skill_scores_set_updated_at on public.student_skill_scores;
create trigger student_skill_scores_set_updated_at
  before update on public.student_skill_scores
  for each row execute function public.set_updated_at();

create index if not exists idx_student_skill_scores_tenant_student
  on public.student_skill_scores (tenant_id, student_id);

alter table public.student_skill_scores enable row level security;
drop policy if exists student_skill_scores_select_members on public.student_skill_scores;
create policy student_skill_scores_select_members on public.student_skill_scores
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = student_skill_scores.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id from public.students s
       where s.user_id = auth.uid() and s.tenant_id = student_skill_scores.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id = auth.uid() and g.tenant_id = student_skill_scores.tenant_id
    )
  );

-- 4. _insert_default_skill_taxonomy ------------------------------------------
-- Idempotent canon seed (no actor). Inserts the 3-level CBR-aligned tree for a
-- tenant, skipping any code that already exists. Returns rows inserted.
create or replace function public._insert_default_skill_taxonomy(
  p_tenant_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_n     integer := 0;
begin
  -- Level 1: hoofdcategorieen --------------------------------------------------
  insert into public.skill_taxonomy (tenant_id, parent_id, level, code, label, sort_order)
  select p_tenant_id, null, 1, v.code, v.label, v.sort_order
    from (values
      ('voertuigbeheersing',      'Voertuigbeheersing',                10),
      ('kijktechniek',            'Kijktechniek',                      20),
      ('wegrijden',               'Wegrijden',                         30),
      ('weggedeelten',            'Rechte en bochtige weggedeelten',   40),
      ('kruispunten',             'Kruispunten',                       50),
      ('invoegen_uitvoegen',      'Invoegen en uitvoegen',             60),
      ('inhalen',                 'Inhalen en zijdelings verplaatsen', 70),
      ('bijzondere_weggedeelten', 'Bijzondere weggedeelten',           80),
      ('verrichtingen',           'Bijzondere verrichtingen',          90),
      ('zelfstandig_rijden',      'Zelfstandig rijden',               100)
    ) as v(code, label, sort_order)
   where not exists (
     select 1 from public.skill_taxonomy s
      where s.tenant_id = p_tenant_id and s.code = v.code
   );
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Level 2: subcategorieen ----------------------------------------------------
  insert into public.skill_taxonomy (tenant_id, parent_id, level, code, label, sort_order, theory_link)
  select p_tenant_id, parent.id, 2,
         v.parent_code || '.' || v.sub_slug, v.label, v.sort_order, v.theory_link
    from (values
      ('voertuigbeheersing',      'zitpositie',       'Zitpositie',                   10, null::text),
      ('voertuigbeheersing',      'basisbediening',   'Basisbediening',               20, null),
      ('voertuigbeheersing',      'schakelen',        'Schakelen',                    30, null),
      ('voertuigbeheersing',      'stuurtechniek',    'Stuurtechniek',                40, null),
      ('voertuigbeheersing',      'milieubewust',     'Milieubewust rijden',          50, null),
      ('kijktechniek',            'spiegelen',        'Spiegelen',                    10, null),
      ('kijktechniek',            'dodehoek',         'Dode hoek',                    20, null),
      ('kijktechniek',            'vooruitkijken',    'Vooruit kijken',               30, null),
      ('kijktechniek',            'breedscannen',     'Breed scannen',                40, null),
      ('wegrijden',               'voorbereiding',    'Voorbereiding',                10, null),
      ('wegrijden',               'uitvoering',       'Uitvoering',                   20, null),
      ('weggedeelten',            'positie',          'Positie',                      10, null),
      ('weggedeelten',            'snelheid',         'Snelheid',                     20, null),
      ('weggedeelten',            'verkeersinzicht',  'Verkeersinzicht',              30, null),
      ('kruispunten',             'naderen',          'Naderen',                      10, null),
      ('kruispunten',             'voorrang',         'Voorrang',                     20, 'Voorrangsregels'),
      ('kruispunten',             'afslaan',          'Afslaan',                      30, null),
      ('kruispunten',             'verkeerslichten',  'Verkeerslichten',              40, null),
      ('invoegen_uitvoegen',      'invoegen',         'Invoegen',                     10, 'Invoegen & Uitvoegen'),
      ('invoegen_uitvoegen',      'uitvoegen',        'Uitvoegen',                    20, 'Invoegen & Uitvoegen'),
      ('inhalen',                 'rijstrookwisselen','Rijstrook wisselen',           10, null),
      ('inhalen',                 'inhalen',          'Inhalen',                      20, null),
      ('inhalen',                 'obstakels',        'Obstakels passeren',           30, null),
      ('bijzondere_weggedeelten', 'rotondes',         'Rotondes',                     10, 'Rotondes & Voorrang'),
      ('bijzondere_weggedeelten', 'erf',              'Erf',                          20, null),
      ('bijzondere_weggedeelten', 'inrit_uitrit',     'Inrit / Uitrit',               30, null),
      ('bijzondere_weggedeelten', 'spoorweg',         'Spoorwegovergangen',           40, null),
      ('bijzondere_weggedeelten', 'voetganger',       'Voetgangersoversteekplaatsen', 50, null),
      ('verrichtingen',           'algemeen',         'Verrichtingen',                10, null),
      ('zelfstandig_rijden',      'navigeren',        'Navigeren',                    10, null),
      ('zelfstandig_rijden',      'keuzes',           'Zelfstandige keuzes',          20, null),
      ('zelfstandig_rijden',      'probleemoplossend','Probleemoplossend vermogen',   30, 'Gevaarherkenning')
    ) as v(parent_code, sub_slug, label, sort_order, theory_link)
    join public.skill_taxonomy parent
      on parent.tenant_id = p_tenant_id and parent.code = v.parent_code
   where not exists (
     select 1 from public.skill_taxonomy s
      where s.tenant_id = p_tenant_id and s.code = v.parent_code || '.' || v.sub_slug
   );
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Level 3: vaardigheden (leaves) --------------------------------------------
  insert into public.skill_taxonomy (tenant_id, parent_id, level, code, label, sort_order, is_critical)
  select p_tenant_id, parent.id, 3,
         v.parent_code || '.' || v.leaf_slug, v.label, v.sort_order, v.is_critical
    from (values
      -- Voertuigbeheersing
      ('voertuigbeheersing.zitpositie',     'stoelinstelling',     'Stoelinstelling',        10, false),
      ('voertuigbeheersing.zitpositie',     'stuurpositie',        'Stuurpositie',           20, false),
      ('voertuigbeheersing.zitpositie',     'spiegelinstelling',   'Spiegelinstelling',      30, false),
      ('voertuigbeheersing.basisbediening', 'starten',             'Starten',                10, false),
      ('voertuigbeheersing.basisbediening', 'stoppen',             'Stoppen',                20, false),
      ('voertuigbeheersing.basisbediening', 'koppeling',           'Koppeling',              30, false),
      ('voertuigbeheersing.basisbediening', 'gasdosering',         'Gasdosering',            40, false),
      ('voertuigbeheersing.basisbediening', 'remmen',              'Remmen',                 50, false),
      ('voertuigbeheersing.schakelen',      'opschakelen',         'Opschakelen',            10, false),
      ('voertuigbeheersing.schakelen',      'terugschakelen',      'Terugschakelen',         20, false),
      ('voertuigbeheersing.schakelen',      'toerentalcontrole',   'Toerentalcontrole',      30, false),
      ('voertuigbeheersing.stuurtechniek',  'stuurcontrole',       'Stuurcontrole',          10, false),
      ('voertuigbeheersing.stuurtechniek',  'bochtentechniek',     'Bochtentechniek',        20, false),
      ('voertuigbeheersing.stuurtechniek',  'vloeiende_beweging',  'Vloeiende bewegingen',   30, false),
      ('voertuigbeheersing.milieubewust',   'anticiperen',         'Anticiperen',            10, false),
      ('voertuigbeheersing.milieubewust',   'brandstofbesparing',  'Brandstofbesparing',     20, false),
      ('voertuigbeheersing.milieubewust',   'uitrollen',           'Uitrollen',              30, false),
      -- Kijktechniek (kritiek: kijkgedrag)
      ('kijktechniek.spiegelen',     'binnenspiegel',         'Binnenspiegel',           10, true),
      ('kijktechniek.spiegelen',     'linker_buitenspiegel',  'Linker buitenspiegel',    20, true),
      ('kijktechniek.spiegelen',     'rechter_buitenspiegel', 'Rechter buitenspiegel',   30, true),
      ('kijktechniek.dodehoek',      'links',                 'Dode hoek links',         10, true),
      ('kijktechniek.dodehoek',      'rechts',                'Dode hoek rechts',        20, true),
      ('kijktechniek.dodehoek',      'schoudercontrole',      'Schoudercontrole',        30, true),
      ('kijktechniek.vooruitkijken', 'ver_vooruit',           'Ver vooruit kijken',      10, true),
      ('kijktechniek.vooruitkijken', 'verkeersbeeld_lezen',   'Verkeersbeeld lezen',     20, true),
      ('kijktechniek.breedscannen',  'zijwegen',              'Zijwegen scannen',        10, true),
      ('kijktechniek.breedscannen',  'fietsers',              'Fietsers scannen',        20, true),
      ('kijktechniek.breedscannen',  'voetgangers',           'Voetgangers scannen',     30, true),
      -- Wegrijden
      ('wegrijden.voorbereiding', 'spiegels',             'Spiegels',               10, false),
      ('wegrijden.voorbereiding', 'richting_aangeven',    'Richting aangeven',      20, false),
      ('wegrijden.voorbereiding', 'omgeving_controleren', 'Omgeving controleren',   30, false),
      ('wegrijden.uitvoering',    'veilig_invoegen',      'Veilig invoegen',        10, false),
      ('wegrijden.uitvoering',    'juiste_snelheid',      'Juiste snelheid',        20, false),
      ('wegrijden.uitvoering',    'controle_voertuig',    'Controle over voertuig', 30, false),
      -- Rechte en bochtige weggedeelten (kritiek: positie, snelheid, besluitvorming)
      ('weggedeelten.positie',         'rijstrook',            'Rijstrookgebruik',          10, true),
      ('weggedeelten.positie',         'afstand',              'Afstand houden',            20, true),
      ('weggedeelten.positie',         'bochten',              'Bochten',                   30, true),
      ('weggedeelten.snelheid',        'juiste_snelheid',      'Juiste snelheid',           10, true),
      ('weggedeelten.snelheid',        'aanpassen',            'Aanpassen aan omstandigheden', 20, true),
      ('weggedeelten.verkeersinzicht', 'herkennen_situaties',  'Situaties herkennen',       10, true),
      ('weggedeelten.verkeersinzicht', 'anticiperen',          'Anticiperen',               20, true),
      -- Kruispunten (kritiek: voorrang)
      ('kruispunten.naderen',         'snelheid_aanpassen', 'Snelheid aanpassen',  10, false),
      ('kruispunten.naderen',         'observatie',         'Observatie',          20, false),
      ('kruispunten.voorrang',        'herkennen',          'Voorrang herkennen',  10, true),
      ('kruispunten.voorrang',        'toepassen',          'Voorrang toepassen',  20, true),
      ('kruispunten.afslaan',         'links',              'Links afslaan',       10, false),
      ('kruispunten.afslaan',         'rechts',             'Rechts afslaan',      20, false),
      ('kruispunten.verkeerslichten', 'anticiperen',        'Anticiperen',         10, false),
      ('kruispunten.verkeerslichten', 'juist_reageren',     'Juist reageren',      20, false),
      -- Invoegen en uitvoegen
      ('invoegen_uitvoegen.invoegen',  'snelheid_maken', 'Snelheid maken',    10, false),
      ('invoegen_uitvoegen.invoegen',  'ruimte_zoeken',  'Ruimte zoeken',     20, false),
      ('invoegen_uitvoegen.invoegen',  'spiegels',       'Spiegels',          30, false),
      ('invoegen_uitvoegen.uitvoegen', 'positie_kiezen', 'Positie kiezen',    10, false),
      ('invoegen_uitvoegen.uitvoegen', 'snelheid_aanpassen', 'Snelheid aanpassen', 20, false),
      -- Inhalen en zijdelings verplaatsen
      ('inhalen.rijstrookwisselen', 'spiegels',          'Spiegels',           10, false),
      ('inhalen.rijstrookwisselen', 'dode_hoek',         'Dode hoek',          20, false),
      ('inhalen.rijstrookwisselen', 'richting',          'Richting aangeven',  30, false),
      ('inhalen.inhalen',           'veilige_afstand',   'Veilige afstand',    10, false),
      ('inhalen.inhalen',           'snelheid',          'Snelheid',           20, false),
      ('inhalen.obstakels',         'geparkeerde_autos', 'Geparkeerde autos',  10, false),
      ('inhalen.obstakels',         'wegwerkzaamheden',  'Wegwerkzaamheden',   20, false),
      -- Bijzondere weggedeelten (kritiek: voorrang op rotonde / inrit / oversteek)
      ('bijzondere_weggedeelten.rotondes',     'naderen',     'Naderen',                    10, false),
      ('bijzondere_weggedeelten.rotondes',     'voorrang',    'Voorrang',                   20, true),
      ('bijzondere_weggedeelten.rotondes',     'positie',     'Positie',                    30, false),
      ('bijzondere_weggedeelten.erf',          'snelheid',    'Snelheid',                   10, false),
      ('bijzondere_weggedeelten.erf',          'kwetsbare',   'Kwetsbare verkeersdeelnemers', 20, false),
      ('bijzondere_weggedeelten.inrit_uitrit', 'voorrang',    'Voorrang',                   10, true),
      ('bijzondere_weggedeelten.inrit_uitrit', 'observatie',  'Observatie',                 20, false),
      ('bijzondere_weggedeelten.spoorweg',     'veiligheid',  'Veiligheid',                 10, false),
      ('bijzondere_weggedeelten.spoorweg',     'observatie',  'Observatie',                 20, false),
      ('bijzondere_weggedeelten.voetganger',   'voorrang',    'Voorrang',                   10, true),
      ('bijzondere_weggedeelten.voetganger',   'anticipatie', 'Anticipatie',                20, false),
      -- Bijzondere verrichtingen
      ('verrichtingen.algemeen', 'vooruit_parkeren',   'Vooruit parkeren',   10, false),
      ('verrichtingen.algemeen', 'achteruit_parkeren', 'Achteruit parkeren', 20, false),
      ('verrichtingen.algemeen', 'fileparkeren',       'Fileparkeren',       30, false),
      ('verrichtingen.algemeen', 'bocht_achteruit',    'Bocht achteruit',    40, false),
      ('verrichtingen.algemeen', 'keren',              'Keren',              50, false),
      ('verrichtingen.algemeen', 'hellingproef',       'Hellingproef',       60, false),
      -- Zelfstandig rijden (kritiek: probleemoplossend / gevaarherkenning)
      ('zelfstandig_rijden.navigeren',         'route_volgen',         'Route volgen',         10, false),
      ('zelfstandig_rijden.navigeren',         'verkeersborden',       'Verkeersborden',       20, false),
      ('zelfstandig_rijden.keuzes',            'rijstrookkeuze',       'Rijstrookkeuze',       10, false),
      ('zelfstandig_rijden.keuzes',            'snelheid',             'Snelheid',             20, false),
      ('zelfstandig_rijden.keuzes',            'positionering',        'Positionering',        30, false),
      ('zelfstandig_rijden.probleemoplossend', 'onverwacht',          'Onverwachte situaties', 10, true),
      ('zelfstandig_rijden.probleemoplossend', 'omleidingen',         'Omleidingen',          20, true),
      ('zelfstandig_rijden.probleemoplossend', 'druk_verkeer',        'Druk verkeer',         30, true)
    ) as v(parent_code, leaf_slug, label, sort_order, is_critical)
    join public.skill_taxonomy parent
      on parent.tenant_id = p_tenant_id and parent.code = v.parent_code
   where not exists (
     select 1 from public.skill_taxonomy s
      where s.tenant_id = p_tenant_id and s.code = v.parent_code || '.' || v.leaf_slug
   );
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end;
$$;

-- 5. seed_default_skill_taxonomy (actor-gated, audited) ----------------------
create or replace function public.seed_default_skill_taxonomy(
  p_tenant_id uuid,
  p_actor     uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  v_inserted := public._insert_default_skill_taxonomy(p_tenant_id);

  if v_inserted > 0 then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'skill.taxonomy_seeded', 'tenant', p_tenant_id::text,
      jsonb_build_object('inserted', v_inserted)
    );
  end if;

  return v_inserted;
end;
$$;

-- 6. set_skill_score ---------------------------------------------------------
-- Grade one leaf skill (1..10) for a student on a lesson. Writes the per-lesson
-- history row, recomputes the student's rollup to the most recent lesson's
-- grade, and audits. Idempotent: re-running with the same args yields the same
-- state.
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
  if p_score is null or p_score < 1 or p_score > 10 then
    raise exception 'skill score must be between 1 and 10';
  end if;

  -- Lesson must belong to the tenant and to the student.
  select student_id into v_lesson_student
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id;
  if v_lesson_student is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_lesson_student <> p_student_id then
    raise exception 'lesson % does not belong to student %', p_lesson_id, p_student_id;
  end if;

  -- Skill must be an active leaf (level 3) in the tenant.
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

  -- Per-lesson grade history.
  insert into public.lesson_skill_scores (
    lesson_id, tenant_id, student_id, skill_id, score, scored_by
  ) values (
    p_lesson_id, p_tenant_id, p_student_id, p_skill_id, p_score, p_actor
  )
  on conflict (lesson_id, skill_id) do update
    set score      = excluded.score,
        scored_by  = excluded.scored_by,
        updated_at = now();

  -- Recompute rollup = grade from the student's most recent lesson for this
  -- skill (by lesson start, then write time), so editing an older lesson never
  -- clobbers a newer grade.
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

-- 7. Provision the default taxonomy for every tenant -------------------------
create or replace function public._provision_skill_taxonomy_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._insert_default_skill_taxonomy(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_provision_skill_taxonomy on public.tenants;
create trigger tenants_provision_skill_taxonomy
  after insert on public.tenants
  for each row execute function public._provision_skill_taxonomy_for_tenant();

-- Backfill existing tenants (idempotent).
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public._insert_default_skill_taxonomy(t.id);
  end loop;
end $$;

-- 8. Grant lockdown ----------------------------------------------------------
revoke all on function public._insert_default_skill_taxonomy(uuid) from public;
revoke execute on function public._insert_default_skill_taxonomy(uuid) from anon, authenticated;
grant execute on function public._insert_default_skill_taxonomy(uuid) to service_role;

revoke all on function public.seed_default_skill_taxonomy(uuid, uuid) from public;
revoke execute on function public.seed_default_skill_taxonomy(uuid, uuid) from anon, authenticated;
grant execute on function public.seed_default_skill_taxonomy(uuid, uuid) to service_role;

revoke all on function public.set_skill_score(uuid, uuid, uuid, uuid, uuid, smallint) from public;
revoke execute on function public.set_skill_score(uuid, uuid, uuid, uuid, uuid, smallint) from anon, authenticated;
grant execute on function public.set_skill_score(uuid, uuid, uuid, uuid, uuid, smallint) to service_role;

revoke all on function public._provision_skill_taxonomy_for_tenant() from public;
revoke execute on function public._provision_skill_taxonomy_for_tenant() from anon, authenticated;
grant execute on function public._provision_skill_taxonomy_for_tenant() to service_role;
