-- Align the smart wizard's initial lesson policy with the established
-- tenant planning settings (50 minute lesson / 10 minute buffer by default).
-- Former 60/15 policy copies are aligned to the tenant's already configured
-- planning defaults. Without legacy tenant settings, only untouched version-1
-- platform copies receive the new 50/10 default.

alter table public.planning_settings
  alter column default_lesson_buffer_minutes set default 10;

update public.appointment_type_policies policy
   set default_duration_minutes = settings.default_lesson_duration_minutes,
       duration_step_minutes = 10,
       default_buffer_after_minutes = settings.default_lesson_buffer_minutes
  from public.planning_settings settings
 where policy.tenant_id = settings.tenant_id
   and policy.code = 'lesson'
   and policy.default_duration_minutes = 60
   and policy.duration_step_minutes = 15
   and policy.default_buffer_after_minutes = 15;

update public.appointment_type_policies policy
   set default_duration_minutes = 50,
       duration_step_minutes = 10,
       default_buffer_after_minutes = 10
 where policy.code = 'lesson'
   and policy.version = 1
   and policy.default_duration_minutes = 60
   and policy.duration_step_minutes = 15
   and policy.default_buffer_after_minutes = 15
   and not exists (
     select 1
       from public.planning_settings settings
      where settings.tenant_id = policy.tenant_id
   );

comment on column public.planning_settings.default_lesson_buffer_minutes is
  'Tenant-configurable default lesson buffer in ten-minute increments; defaults to 10 minutes.';
