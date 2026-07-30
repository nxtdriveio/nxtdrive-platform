-- Measure the real lesson-card completion interval so the 60-second target can
-- be evaluated with production telemetry instead of being a visual claim.

alter table public.ris_lesson_cards
  add column if not exists completion_started_at timestamptz;

update public.ris_lesson_cards
set completion_started_at = created_at
where completion_started_at is null
  and publication_status in (
    'draft',
    'completion_in_progress',
    'ready_to_publish'
  );

create or replace function public.track_ris_completion_timing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_started_at timestamptz;
  v_completed_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.completion_started_at is null
       and new.publication_status in (
         'draft',
         'completion_in_progress',
         'ready_to_publish'
       ) then
      new.completion_started_at := now();
    end if;
    return new;
  end if;

  if new.completion_started_at is null
     and new.publication_status in (
       'draft',
       'completion_in_progress',
       'ready_to_publish'
     ) then
    new.completion_started_at := now();
  end if;

  if new.publication_status in (
       'published',
       'published_to_student',
       'waiting_for_student_response',
       'fully_completed'
     )
     and old.publication_status not in (
       'published',
       'published_to_student',
       'waiting_for_student_response',
       'fully_completed'
     ) then
    v_started_at := coalesce(
      old.completion_started_at,
      new.completion_started_at,
      old.created_at
    );
    v_completed_at := coalesce(new.published_at, now());
    insert into public.audit_log (
      actor_user_id,
      tenant_id,
      action,
      target_type,
      target_id,
      payload
    ) values (
      new.published_by,
      new.tenant_id,
      'ris.lesson_completion_timed',
      'ris_lesson_card',
      new.id::text,
      jsonb_build_object(
        'lesson_id', new.lesson_id,
        'student_id', new.student_id,
        'started_at', v_started_at,
        'completed_at', v_completed_at,
        'duration_seconds',
          greatest(0, round(extract(epoch from (v_completed_at - v_started_at)))),
        'target_seconds', 60,
        'within_target',
          extract(epoch from (v_completed_at - v_started_at)) <= 60
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ris_lesson_cards_completion_timing
  on public.ris_lesson_cards;

create trigger ris_lesson_cards_completion_timing
before insert or update of publication_status, completion_started_at
on public.ris_lesson_cards
for each row
execute function public.track_ris_completion_timing();
