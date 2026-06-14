-- 0116_theme_presets.sql
-- Platform-managed light/dark theme presets for white-label tenants.

create table if not exists public.theme_presets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  tokens_light jsonb not null,
  tokens_dark jsonb not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  check (jsonb_typeof(tokens_light) = 'object'),
  check (jsonb_typeof(tokens_dark) = 'object')
);

drop trigger if exists theme_presets_set_updated_at on public.theme_presets;
create trigger theme_presets_set_updated_at
  before update on public.theme_presets
  for each row execute function public.set_updated_at();

alter table public.tenant_branding
  add column if not exists theme_preset_id uuid references public.theme_presets(id) on delete set null,
  add column if not exists theme_overrides jsonb;

create index if not exists idx_tenant_branding_theme_preset
  on public.tenant_branding(theme_preset_id)
  where theme_preset_id is not null;

alter table public.theme_presets enable row level security;

drop policy if exists theme_presets_platform_admin_select on public.theme_presets;
create policy theme_presets_platform_admin_select on public.theme_presets
  for select
  using (public.is_platform_admin());

drop policy if exists theme_presets_platform_admin_write on public.theme_presets;
create policy theme_presets_platform_admin_write on public.theme_presets
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

insert into public.theme_presets (
  slug,
  name,
  description,
  tokens_light,
  tokens_dark,
  is_system,
  is_active
)
values
  (
    'platform-violet',
    'Platform Violet',
    'NXTDRIVE standaardpalet als referentie en veilige fallback.',
    jsonb_build_object(
      'background', '#fafafb',
      'foreground', '#0b0b14',
      'card', '#ffffff',
      'card_foreground', '#0b0b14',
      'muted', '#f3f3f7',
      'muted_foreground', '#6b6b7b',
      'border', '#e5e5ec',
      'input', '#ffffff',
      'popover', '#ffffff',
      'popover_foreground', '#0b0b14',
      'accent', '#f3eeff',
      'accent_foreground', '#392693',
      'primary', '#6b4eff',
      'primary_foreground', '#ffffff',
      'success', '#10a36c',
      'warning', '#d97706',
      'danger', '#dc2626',
      'info', '#2563eb'
    ),
    jsonb_build_object(
      'background', '#08080f',
      'foreground', '#ececf2',
      'card', '#11111d',
      'card_foreground', '#ececf2',
      'muted', '#1a1a28',
      'muted_foreground', '#9a9ab0',
      'border', '#25253a',
      'input', '#14141f',
      'popover', '#11111d',
      'popover_foreground', '#ececf2',
      'accent', '#1c1733',
      'accent_foreground', '#b8a0ff',
      'primary', '#8b6fff',
      'primary_foreground', '#ffffff',
      'success', '#34d399',
      'warning', '#fbbf24',
      'danger', '#f87171',
      'info', '#60a5fa'
    ),
    true,
    true
  ),
  (
    'graphite-gold',
    'Graphite Gold',
    'Neutraal antraciet shell met warme goudaccenten voor premium white-label tenants.',
    jsonb_build_object(
      'background', '#f8f5ee',
      'foreground', '#17140b',
      'card', '#fffdfa',
      'card_foreground', '#17140b',
      'muted', '#efe7d6',
      'muted_foreground', '#6d6243',
      'border', '#ddd0ab',
      'input', '#fffdf7',
      'popover', '#fffdf7',
      'popover_foreground', '#17140b',
      'accent', '#f1e3a4',
      'accent_foreground', '#4b3900',
      'primary', '#d4ab12',
      'primary_foreground', '#1a1405',
      'success', '#149a71',
      'warning', '#c88600',
      'danger', '#d34f3d',
      'info', '#2f70d1'
    ),
    jsonb_build_object(
      'background', '#0b0b09',
      'foreground', '#f4efe3',
      'card', '#14130f',
      'card_foreground', '#f4efe3',
      'muted', '#1b1913',
      'muted_foreground', '#b5ab8f',
      'border', '#2d291d',
      'input', '#181712',
      'popover', '#14130f',
      'popover_foreground', '#f4efe3',
      'accent', '#25200d',
      'accent_foreground', '#f0d46c',
      'primary', '#d8b01d',
      'primary_foreground', '#171203',
      'success', '#39d2a0',
      'warning', '#efb84b',
      'danger', '#f67a6a',
      'info', '#6ca8ff'
    ),
    true,
    true
  ),
  (
    'slate-indigo',
    'Slate Indigo',
    'Koele leisteenbasis met indigo accent voor een meer zakelijke white-label uitstraling.',
    jsonb_build_object(
      'background', '#f6f8fc',
      'foreground', '#101728',
      'card', '#ffffff',
      'card_foreground', '#101728',
      'muted', '#e9edf7',
      'muted_foreground', '#5f6b86',
      'border', '#d8dfef',
      'input', '#ffffff',
      'popover', '#ffffff',
      'popover_foreground', '#101728',
      'accent', '#dfe5ff',
      'accent_foreground', '#23356c',
      'primary', '#4f63ff',
      'primary_foreground', '#ffffff',
      'success', '#11936d',
      'warning', '#d98311',
      'danger', '#d64a54',
      'info', '#2f75e8'
    ),
    jsonb_build_object(
      'background', '#0a1018',
      'foreground', '#edf2ff',
      'card', '#121a27',
      'card_foreground', '#edf2ff',
      'muted', '#172131',
      'muted_foreground', '#98a7c4',
      'border', '#243246',
      'input', '#121b29',
      'popover', '#121a27',
      'popover_foreground', '#edf2ff',
      'accent', '#1a2540',
      'accent_foreground', '#b8c7ff',
      'primary', '#7385ff',
      'primary_foreground', '#ffffff',
      'success', '#3ad0a6',
      'warning', '#f0b451',
      'danger', '#f67a82',
      'info', '#7fb0ff'
    ),
    true,
    true
  ),
  (
    'midnight-emerald',
    'Midnight Emerald',
    'Donkere premium basis met groenblauwe accenten voor modernere tenant-branding.',
    jsonb_build_object(
      'background', '#f3faf8',
      'foreground', '#0e1d1a',
      'card', '#ffffff',
      'card_foreground', '#0e1d1a',
      'muted', '#e5f1ed',
      'muted_foreground', '#58706c',
      'border', '#cfe2db',
      'input', '#ffffff',
      'popover', '#ffffff',
      'popover_foreground', '#0e1d1a',
      'accent', '#d9f2ea',
      'accent_foreground', '#0d5a4c',
      'primary', '#1cb88f',
      'primary_foreground', '#052019',
      'success', '#169b77',
      'warning', '#d98a20',
      'danger', '#d9544c',
      'info', '#2280d9'
    ),
    jsonb_build_object(
      'background', '#071311',
      'foreground', '#ecfaf5',
      'card', '#0d1b18',
      'card_foreground', '#ecfaf5',
      'muted', '#132421',
      'muted_foreground', '#93aea8',
      'border', '#1f3834',
      'input', '#0f1f1b',
      'popover', '#0d1b18',
      'popover_foreground', '#ecfaf5',
      'accent', '#12302a',
      'accent_foreground', '#8de9d1',
      'primary', '#22c79c',
      'primary_foreground', '#041d17',
      'success', '#35d7a9',
      'warning', '#f2b955',
      'danger', '#f47a70',
      'info', '#63b3ff'
    ),
    true,
    true
  )
on conflict (slug) do nothing;
