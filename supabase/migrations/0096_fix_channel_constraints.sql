-- ============================================================================
-- 0096_fix_channel_constraints.sql
--
-- Veiligheidsnet voor omgevingen waar 0093 al was toegepast vóór de drop-loop
-- werd uitgebreid met de channel-check. In dat geval bevat notification_templates
-- nog steeds de originele `check (channel in ('email'))` uit 0026, waardoor
-- inapp/push kolomwaarden worden geblokkeerd door de CHECK-violations.
--
-- Aanpak:
--   1. Drop ALLE check-constraints op notification_templates / notification_log
--      die 'channel' EN 'email' bevatten (inclusief de narrowe 'email'-only
--      constraints die eventueel overblijven).
--   2. Voeg de verruimde channel-checks toe als ze nog niet bestaan.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
      from pg_constraint
     where contype = 'c'
       and conrelid in (
         'public.notification_log'::regclass,
         'public.notification_templates'::regclass
       )
       and pg_get_constraintdef(oid) ilike '%channel%'
       and pg_get_constraintdef(oid) ilike '%email%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- Voeg verruimde channel-checks opnieuw toe (idempotent via naam-check)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where contype = 'c'
       and conrelid = 'public.notification_templates'::regclass
       and conname  = 'notification_templates_channel_check'
  ) then
    alter table public.notification_templates
      add constraint notification_templates_channel_check
      check (channel in ('email', 'inapp', 'push'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where contype = 'c'
       and conrelid = 'public.notification_log'::regclass
       and conname  = 'notification_log_channel_check'
  ) then
    alter table public.notification_log
      add constraint notification_log_channel_check
      check (channel in ('email', 'inapp', 'push'));
  end if;
end $$;
