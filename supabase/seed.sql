-- seed.sql — idempotent demo data for the NXTDRIVE Demo Academy tenant ONLY.
-- Never seed real driving schools (e.g. Van Dijk) here.

insert into public.tenants (slug, name, plan, white_label_enabled)
values ('demo-academy', 'NXTDRIVE Demo Academy', 'pro', false)
on conflict (slug) do update set name = excluded.name;

-- Public contact phone for the demo tenant (Task #115 — Berichten). The
-- leerling-app "Bel"-action only shows when this is set. Tenant-configurable.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.tenant_settings (tenant_id, key, value)
select
  demo.id,
  'contact_phone',
  jsonb_build_object('phone', '+31 20 123 4567')
from demo
on conflict (tenant_id, key) do nothing;

-- Default cancellation policy (tenant-configurable, never hardcoded in app code)
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.tenant_settings (tenant_id, key, value)
select
  demo.id,
  'cancellation_policy',
  jsonb_build_object(
    'tiers', jsonb_build_array(
      jsonb_build_object('hours_before', 72, 'refund_pct', 100),
      jsonb_build_object('hours_before', 24, 'refund_pct', 50),
      jsonb_build_object('hours_before',  0, 'refund_pct',  0)
    )
  )
from demo
on conflict (tenant_id, key) do nothing;

-- Default examenvoorbereidingsbeleid (Examenflow A — tenant-configurable, never
-- hardcoded). Mirrors DEFAULT_EXAM_PREP_POLICY in lib/exam/policy.ts.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.tenant_settings (tenant_id, key, value)
select
  demo.id,
  'exam_preparation_policy',
  jsonb_build_object(
    'required_documents', jsonb_build_array(
      jsonb_build_object('code', 'id', 'label', 'Geldig identiteitsbewijs (paspoort, ID-kaart of rijbewijs)'),
      jsonb_build_object('code', 'theory_certificate', 'label', 'Geldig theoriecertificaat'),
      jsonb_build_object('code', 'glasses', 'label', 'Bril of lenzen (indien van toepassing)')
    ),
    'exam_day_tips', jsonb_build_array(
      'Zorg dat je goed uitgerust en ruim op tijd bent.',
      'Neem een geldig identiteitsbewijs mee.',
      'Blijf rustig en rijd zoals je het geleerd hebt.',
      'Stel gerust vragen als een instructie onduidelijk is.'
    )
  )
from demo
on conflict (tenant_id, key) do nothing;

-- Default lead scoring policy (Fase 1B — tenant-configurable, never hardcoded).
-- Mirrors DEFAULT_LEAD_SCORE_POLICY in lib/leads/lead-score.ts.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.tenant_settings (tenant_id, key, value)
select
  demo.id,
  'lead_score_policy',
  jsonb_build_object(
    'weights', jsonb_build_object(
      'phone',            10,
      'email',             5,
      'intake',           15,
      'theory',           10,
      'cbr',               5,
      'health',            5,
      'soon',             15,
      'intensity',         5,
      'referral',          5,
      'trial_planned',    15,
      'trial_confirmed',  10,
      'trial_completed',  10,
      'fresh',            10
    ),
    'bands', jsonb_build_object('warm', 30, 'hot', 60)
  )
from demo
on conflict (tenant_id, key) do nothing;

-- Default (non-whitelabel) branding row so the join always succeeds.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.tenant_branding (tenant_id, primary_color, primary_foreground)
select demo.id, '#6b4eff', '#ffffff'
from demo
on conflict (tenant_id) do nothing;

-- Demo leads for the NXTDRIVE Demo Academy ---------------------------------
-- Idempotent via stable UUIDs so re-running the seed does not duplicate.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.leads (id, tenant_id, status, source, full_name, email, phone, postcode, message)
select v.id, demo.id, v.status::public.lead_status, v.source::public.lead_source,
       v.full_name, v.email, v.phone, v.postcode, v.message
from demo,
(values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'new',             'website',   'Sophie Bakker',     'sophie.bakker@example.nl',   '+31611111111', '2611AA', 'Graag een proefles in het weekend.'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'contacted',       'instagram', 'Lisa de Jong',      'lisa.dejong@example.nl',     '+31622222222', '2622BB', 'Interesse in spoedopleiding.'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'package_advised', 'google',    'Mark Jansen',       'mark.jansen@example.nl',     '+31633333333', '2633CC', 'Wat kost een pakket van 30 lessen?'),
  ('11111111-1111-4111-8111-000000000004'::uuid, 'converted',       'referral',  'Emma van Dijk',     'emma.vandijk@example.nl',    '+31644444444', '2644DD', 'Wil graag starten in juni.'),
  ('11111111-1111-4111-8111-000000000005'::uuid, 'dropped',         'facebook',  'Kevin Willems',     'kevin.willems@example.nl',   '+31655555555', '2655EE', 'Geen reactie meer na contact.')
) as v(id, status, source, full_name, email, phone, postcode, message)
on conflict (id) do nothing;

-- Initial 'created' event per demo lead
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.lead_events (id, lead_id, tenant_id, event_type, payload)
select v.event_id, v.lead_id, demo.id, 'created'::public.lead_event_type, v.payload
from demo,
(values
  ('22222222-2222-4222-8222-000000000001'::uuid, '11111111-1111-4111-8111-000000000001'::uuid, jsonb_build_object('source', 'website')),
  ('22222222-2222-4222-8222-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid, jsonb_build_object('source', 'instagram')),
  ('22222222-2222-4222-8222-000000000003'::uuid, '11111111-1111-4111-8111-000000000003'::uuid, jsonb_build_object('source', 'google')),
  ('22222222-2222-4222-8222-000000000004'::uuid, '11111111-1111-4111-8111-000000000004'::uuid, jsonb_build_object('source', 'referral')),
  ('22222222-2222-4222-8222-000000000005'::uuid, '11111111-1111-4111-8111-000000000005'::uuid, jsonb_build_object('source', 'facebook'))
) as v(event_id, lead_id, payload)
on conflict (id) do nothing;

-- Demo packages for the NXTDRIVE Demo Academy ------------------------------
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.packages (id, tenant_id, name, credits_total, price_cents, valid_days, active)
select v.id, demo.id, v.name, v.credits_total, v.price_cents, v.valid_days, true
from demo,
(values
  ('33333333-3333-4333-8333-000000000001'::uuid, 'Proefles',          1,  6500,  null),
  ('33333333-3333-4333-8333-000000000002'::uuid, 'Starterspakket',   10, 62500,  365),
  ('33333333-3333-4333-8333-000000000003'::uuid, 'Standaardpakket',  30, 180000, 365),
  ('33333333-3333-4333-8333-000000000004'::uuid, 'Spoedopleiding',   40, 245000, 90)
) as v(id, name, credits_total, price_cents, valid_days)
on conflict (id) do nothing;

-- Demo student for the converted demo lead (Emma van Dijk) -----------------
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.students (id, tenant_id, lead_id, full_name, email, phone, postcode)
select v.id, demo.id, v.lead_id, v.full_name, v.email, v.phone, v.postcode
from demo,
(values
  ('44444444-4444-4444-8444-000000000001'::uuid,
   '11111111-1111-4111-8111-000000000004'::uuid,
   'Emma van Dijk', 'emma.vandijk@example.nl', '+31644444444', '2644DD')
) as v(id, lead_id, full_name, email, phone, postcode)
on conflict (id) do nothing;

-- Demo credit ledger: standaardpakket toegekend aan Emma + 2 verbruikte lessen
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.credit_ledger (id, tenant_id, student_id, delta, reason, related_type, related_id, note)
select v.id, demo.id, v.student_id, v.delta, v.reason::public.credit_reason, v.related_type, v.related_id, v.note
from demo,
(values
  ('55555555-5555-4555-8555-000000000001'::uuid,
   '44444444-4444-4444-8444-000000000001'::uuid,
   30, 'package_purchase', 'package',
   '33333333-3333-4333-8333-000000000003'::uuid,
   'Pakket toegekend: Standaardpakket'),
  ('55555555-5555-4555-8555-000000000002'::uuid,
   '44444444-4444-4444-8444-000000000001'::uuid,
   -1, 'lesson_consumed', null, null, 'Demo: les 1 verbruikt'),
  ('55555555-5555-4555-8555-000000000003'::uuid,
   '44444444-4444-4444-8444-000000000001'::uuid,
   -1, 'lesson_consumed', null, null, 'Demo: les 2 verbruikt')
) as v(id, student_id, delta, reason, related_type, related_id, note)
on conflict (id) do nothing;

-- Default CBR competencies for the NXTDRIVE Demo Academy -------------------
-- Idempotent via (tenant_id, code) unique key; codes/labels match
-- seed_default_cbr_competencies() in 0022_cbr_checklist.sql.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.cbr_competencies (tenant_id, code, label, sort_order)
select demo.id, v.code, v.label, v.sort_order
from demo,
(values
  ('voertuigbediening',       'Voertuigbediening',                10),
  ('kijktechniek',            'Kijktechniek en spiegelgebruik',   20),
  ('bochten',                 'Bochten nemen',                    30),
  ('kruispunten',             'Kruispunten',                      40),
  ('voorrang',                'Voorrang verlenen',                50),
  ('snelheid',                'Snelheid aanpassen',               60),
  ('invoegen',                'Invoegen en uitvoegen',            70),
  ('snelweg',                 'Snelweg rijden',                   80),
  ('file',                    'File rijden',                      90),
  ('parkeren',                'Parkeren',                        100),
  ('bijzondere_verrichtingen','Bijzondere verrichtingen',        110),
  ('milieubewust',            'Milieubewust rijden',             120),
  ('examenoefening',          'Examenoefening',                  130)
) as v(code, label, sort_order)
on conflict (tenant_id, code) do nothing;

-- Demo CBR progress for Emma — a handful of competencies ticked so the
-- student PWA shows a meaningful readiness percentage out of the box.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.student_cbr_progress (
  student_id, tenant_id, competency_id, achieved_at
)
select
  '44444444-4444-4444-8444-000000000001'::uuid,
  demo.id,
  c.id,
  now()
from demo
join public.cbr_competencies c
  on c.tenant_id = demo.id
 and c.code in ('voertuigbediening', 'kijktechniek', 'bochten', 'kruispunten')
on conflict (student_id, competency_id) do nothing;

-- Default Leskaart skill taxonomy for the NXTDRIVE Demo Academy ------------
-- Idempotent; mirrors _insert_default_skill_taxonomy() in 0030. New tenants
-- get this via the tenants_provision_skill_taxonomy trigger; demo-academy is
-- seeded explicitly here so the tree is present after a clean seed.
select public._insert_default_skill_taxonomy(
  (select id from public.tenants where slug = 'demo-academy')
);

-- Default theory modules + skill couplings for the NXTDRIVE Demo Academy ---
-- Idempotent; mirrors _insert_default_theory_modules() in 0033. New tenants
-- get this via the tenants_provision_theory_modules trigger; demo-academy is
-- seeded explicitly here. Runs AFTER the taxonomy seed above so couplings
-- can match leaves by code.
select public._insert_default_theory_modules(
  (select id from public.tenants where slug = 'demo-academy')
);

-- Demo Kanban data for the NXTDRIVE Demo Academy ---------------------------
-- Departments/boards/columns are provisioned by migration 0027's backfill for
-- every tenant (incl. demo-academy); here we add a couple of example cards on
-- the Administratie board's "Te doen" column, linked to existing demo entities.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
),
admin_board as (
  select b.id as board_id, b.department_id
    from public.task_boards b
    join public.task_departments d on d.id = b.department_id
    join demo on demo.id = b.tenant_id
   where d.key = 'administratie'
   order by b.sort_order
   limit 1
),
todo_col as (
  select c.id as column_id
    from public.task_columns c
    join admin_board ab on ab.board_id = c.board_id
   where c.name = 'Te doen'
   limit 1
)
insert into public.tasks (
  id, tenant_id, board_id, column_id, department_id, title, description, priority, position
)
select v.id, demo.id, ab.board_id, tc.column_id, ab.department_id,
       v.title, v.description, v.priority::public.task_priority, v.position
from demo, admin_board ab, todo_col tc,
(values
  ('66666666-6666-4666-8666-000000000001'::uuid,
   'Controleer CBR-machtiging leerling',
   'Voorbeeldtaak: controleer de CBR-machtiging van een leerling.', 'high', 0),
  ('66666666-6666-4666-8666-000000000002'::uuid,
   'Bel nieuwe lead voor proefles',
   'Voorbeeldtaak: neem contact op met een nieuwe lead.', 'normal', 1)
) as v(id, title, description, priority, position)
on conflict (id) do nothing;

-- Example polymorphic links: a task to a student, a task to a lead.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.task_links (id, tenant_id, task_id, entity_type, entity_id)
select v.id, demo.id, v.task_id, v.entity_type::public.task_link_type, v.entity_id
from demo,
(values
  ('77777777-7777-4777-8777-000000000001'::uuid,
   '66666666-6666-4666-8666-000000000001'::uuid,
   'student', '44444444-4444-4444-8444-000000000001'::uuid),
  ('77777777-7777-4777-8777-000000000002'::uuid,
   '66666666-6666-4666-8666-000000000002'::uuid,
   'lead',    '11111111-1111-4111-8111-000000000001'::uuid)
) as v(id, task_id, entity_type, entity_id)
on conflict (id) do nothing;

-- Demo referral code + a referral-attributed lead -------------------------
-- One personal, shareable code per student. The demo student acts as the
-- referrer; a new lead comes in via that code (source 'referral').
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.referral_codes (id, tenant_id, student_id, code)
select '88888888-8888-4888-8888-000000000001'::uuid, demo.id,
       '44444444-4444-4444-8444-000000000001'::uuid, 'DEMO1234'
from demo
on conflict (id) do nothing;

with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.leads (
  id, tenant_id, status, source, full_name, email, phone, postcode, message,
  referred_by_student_id
)
select '11111111-1111-4111-8111-000000000006'::uuid, demo.id,
       'new'::public.lead_status, 'referral'::public.lead_source,
       'Noa Smit', 'noa.smit@example.nl', '+31666666666', '2666FF',
       'Aangebracht door een huidige leerling.',
       '44444444-4444-4444-8444-000000000001'::uuid
from demo
on conflict (id) do nothing;

with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.lead_events (id, lead_id, tenant_id, event_type, payload)
select '22222222-2222-4222-8222-000000000006'::uuid,
       '11111111-1111-4111-8111-000000000006'::uuid, demo.id,
       'created'::public.lead_event_type,
       jsonb_build_object('source', 'referral', 'code', 'DEMO1234')
from demo
on conflict (id) do nothing;

-- ── Fase F1: Demo branches (vestigingen) ──────────────────────────────────
-- Demonstrates the multi-branch capability. Only demo-academy. Idempotent.
with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.branches (id, tenant_id, name, slug, address, city, is_active)
select
  '33333333-3333-4333-8333-000000000001'::uuid, demo.id,
  'Hoofdkantoor', 'hoofdkantoor', 'Rijksstraatweg 1', 'Den Haag', true
from demo
on conflict (tenant_id, slug) do update set name = excluded.name, is_active = excluded.is_active;

with demo as (
  select id from public.tenants where slug = 'demo-academy'
)
insert into public.branches (id, tenant_id, name, slug, address, city, is_active)
select
  '33333333-3333-4333-8333-000000000002'::uuid, demo.id,
  'Vestiging Zuid', 'vestiging-zuid', 'Zuiderparklaan 50', 'Den Haag', true
from demo
on conflict (tenant_id, slug) do update set name = excluded.name, is_active = excluded.is_active;
