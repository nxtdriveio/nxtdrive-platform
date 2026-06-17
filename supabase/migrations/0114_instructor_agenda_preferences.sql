alter table public.profiles
  add column if not exists calendar_start_hour smallint not null default 6,
  add column if not exists calendar_end_hour smallint not null default 22;

alter table public.profiles
  drop constraint if exists profiles_calendar_hour_range_check;

alter table public.profiles
  add constraint profiles_calendar_hour_range_check
  check (
    calendar_start_hour >= 0
    and calendar_start_hour <= 23
    and calendar_end_hour >= 1
    and calendar_end_hour <= 24
    and calendar_start_hour < calendar_end_hour
  );

alter table public.agenda_appointments
  add column if not exists color_override text;
