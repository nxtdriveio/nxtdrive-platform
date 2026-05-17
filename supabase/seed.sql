-- seed.sql — idempotent demo data for the NXTDRIVE Demo Academy tenant ONLY.
-- Never seed real driving schools (e.g. Van Dijk) here.

insert into public.tenants (slug, name, plan, white_label_enabled)
values ('demo-academy', 'NXTDRIVE Demo Academy', 'pro', false)
on conflict (slug) do update set name = excluded.name;

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
