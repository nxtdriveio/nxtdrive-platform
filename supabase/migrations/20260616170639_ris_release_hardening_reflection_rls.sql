-- RIS-10 release hardening:
-- Guided reflections are written by staff, but once the parent RIS lesson card
-- is published the student/guardian view must be able to read the shared
-- reflection fields. Concepts and internal observations stay staff-only.

drop policy if exists ris_guided_reflections_select_staff on public.ris_guided_reflections;
drop policy if exists ris_guided_reflections_select_members on public.ris_guided_reflections;

create policy ris_guided_reflections_select_members on public.ris_guided_reflections
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = ris_guided_reflections.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1 from public.ris_lesson_cards c
       where c.id = ris_guided_reflections.lesson_card_id
         and c.tenant_id = ris_guided_reflections.tenant_id
         and c.publication_status = 'published'
         and (
           c.student_id in (
             select s.id from public.students s
              where s.user_id = auth.uid()
                and s.tenant_id = c.tenant_id
           )
           or c.student_id in (
             select g.student_id from public.student_guardians g
              where g.user_id = auth.uid()
                and g.tenant_id = c.tenant_id
           )
         )
    )
  );
