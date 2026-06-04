-- ============================================================================
-- 0090_notification_type_preferences.sql
--
-- Voeg per-type meldingsvoorkeuren toe aan notification_preferences.
--
-- Aanpak: een jsonb-kolom `type_preferences` op de bestaande rij
-- (user_id, tenant_id). Sleutel = categorie (string), waarde = boolean.
-- Een ontbrekende sleutel betekent opt-in (standaard ingeschakeld).
-- Lege object `{}` = alle categorieën ingeschakeld.
--
-- Categorieën (student-facing):
--   les_herinnering     → lesson_reminder
--   proefles            → trial_lesson_confirmed, trial_lesson_received
--   tegoed_waarschuwing → credit_low
--   examen_updates      → exam_invitation, exam_confirmed, exam_planned,
--                          exam_passed, exam_failed, exam_day_reminder
--
-- Staff-facing typen (task_assigned, payment_*, etc.) kennen geen categorie
-- en worden altijd verstuurd.
-- ============================================================================

alter table public.notification_preferences
  add column if not exists type_preferences jsonb not null default '{}'::jsonb;

comment on column public.notification_preferences.type_preferences is
  'Per-categorie opt-in/out voor meldingen. Ontbrekende sleutel = ingeschakeld. '
  'Voorbeeld: {"les_herinnering": false} schakelt lesherinneringen uit.';
