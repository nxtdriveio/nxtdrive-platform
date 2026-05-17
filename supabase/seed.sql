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
select demo.id, '#2563eb', '#ffffff'
from demo
on conflict (tenant_id) do nothing;
