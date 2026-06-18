-- Align ris_lesson_cards with the clean-start _ensure_ris_lesson_card RPC.
-- The RPC writes created_by and uses on conflict (tenant_id, lesson_id).

alter table if exists public.ris_lesson_cards
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create unique index if not exists idx_ris_lesson_cards_tenant_lesson_unique
  on public.ris_lesson_cards (tenant_id, lesson_id);

comment on column public.ris_lesson_cards.created_by is
  'Actor that initially created the RIS lesson card through the clean-start/canonical RIS flow.';
