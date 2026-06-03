-- ===========================================================================
-- 0080 — Reviewsysteem (in-app rating + aggregatie)
--
-- Het INTERNE reviewsysteem: een leerling laat een sterbeoordeling (1–5) +
-- optionele tekst achter, tenant-scoped opgeslagen. Dit voedt de "Reviewscore"-
-- kaart op het rapportagedashboard met echte cijfers (geen mock/placeholder).
--
-- Complementair aan de groeimodule "Review- & referralflow" (0076): die spoort
-- aan tot EXTERNE Google-reviews. Dit model is de INTERNE rating die de
-- rapportagescore voedt. Geen tweede leerling-prompt: de in-app reviewbanner
-- (0076) blijft de Google-CTA; dit formulier leeft op het profiel.
--
-- Patroon 1:1 conform de rest van het project:
--   * Tenant-scoped tabel met tenant-consistente FK naar students(id, tenant_id).
--   * Eén review per leerling (UNIQUE), bewerkbaar via een idempotente upsert-RPC.
--   * Select-only RLS: leerling/voogd zien de eigen review; tenant_admin/
--     instructor lezen tenant-breed (aggregatie); cross-tenant geblokkeerd.
--   * Mutatie uitsluitend via vergrendelde SECURITY DEFINER RPC (service_role;
--     anon/authenticated revoked). Altijd geaudit.
-- ===========================================================================

create table if not exists public.student_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  student_id  uuid not null,
  rating      smallint not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Eén review per leerling binnen de tenant (idempotente upsert).
  constraint student_reviews_student_unique unique (tenant_id, student_id),
  -- Tenant-consistente FK: de review hoort bij een leerling uit DEZELFDE tenant.
  constraint student_reviews_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade
);

drop trigger if exists student_reviews_set_updated_at on public.student_reviews;
create trigger student_reviews_set_updated_at
  before update on public.student_reviews
  for each row execute function public.set_updated_at();

-- Aggregatie leest tenant-breed op recentheid (recent citaat) en op sterwaarde
-- (verdeling/gemiddelde).
create index if not exists idx_student_reviews_tenant_created
  on public.student_reviews (tenant_id, created_at desc);
create index if not exists idx_student_reviews_tenant_rating
  on public.student_reviews (tenant_id, rating);

-- RLS ----------------------------------------------------------------------
alter table public.student_reviews enable row level security;

-- SELECT: platform-admin; staf (tenant_admin/instructor) leest de hele tenant
-- (aggregatie); een leerling ziet de eigen review; een voogd ziet de review van
-- een gekoppeld kind. GEEN brede my_tenant_ids()-tak (die zou lekken naar elke
-- membershiprol, incl. parent/student). Schrijven uitsluitend via de RPC.
drop policy if exists student_reviews_select on public.student_reviews;
create policy student_reviews_select on public.student_reviews
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = student_reviews.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = student_reviews.tenant_id
    )
    or student_id in (
      select g.student_id
        from public.student_guardians g
        join public.students s
          on s.id = g.student_id and s.tenant_id = student_reviews.tenant_id
       where g.user_id = auth.uid()
    )
  );
-- Geen INSERT/UPDATE/DELETE policies — alle writes via de RPC hieronder.

-- ---------------------------------------------------------------------------
-- RPC: upsert_student_review — leerling/voogd zet of bewerkt de eigen review
-- ---------------------------------------------------------------------------
-- Autorisatie: de leerling zelf (students.user_id = actor) OF een gekoppelde
-- voogd. Bewust NIET staf — een review is de eigen ervaring van de leerling.
-- Idempotent: bestaat er al een review, dan wordt die bewerkt (één per leerling).
-- Valideert de sterwaarde (1–5) en normaliseert lege tekst naar NULL. Geaudit.
create or replace function public.upsert_student_review(
  p_tenant_id  uuid,
  p_student_id uuid,
  p_actor      uuid,
  p_rating     integer,
  p_body       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_body text;
begin
  if p_actor is null then
    raise exception 'actor is required';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;

  -- Autorisatie: leerling-zelf OF gekoppelde voogd. Géén staf.
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id and s.user_id = p_actor
  ) and not exists (
    select 1 from public.student_guardians g
     where g.student_id = p_student_id and g.tenant_id = p_tenant_id and g.user_id = p_actor
  ) then
    raise exception 'actor % not authorized for student % in tenant %',
      p_actor, p_student_id, p_tenant_id;
  end if;

  -- Leerling moet in de tenant bestaan (tenant-consistente FK dekt dit ook af).
  if not exists (
    select 1 from public.students s where s.id = p_student_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Lege/whitespace-only tekst → NULL (optioneel veld).
  v_body := nullif(btrim(coalesce(p_body, '')), '');

  insert into public.student_reviews (tenant_id, student_id, rating, body)
  values (p_tenant_id, p_student_id, p_rating, v_body)
  on conflict (tenant_id, student_id)
  do update set rating = excluded.rating,
               body    = excluded.body
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student_review.upserted', 'student', p_student_id::text,
    jsonb_build_object('review_id', v_id, 'rating', p_rating, 'has_text', v_body is not null)
  );

  return v_id;
end;
$$;

-- Grant lockdown — service_role only (anon/authenticated revoked).
revoke all     on function public.upsert_student_review(uuid, uuid, uuid, integer, text) from public;
revoke execute on function public.upsert_student_review(uuid, uuid, uuid, integer, text) from anon, authenticated;
grant  execute on function public.upsert_student_review(uuid, uuid, uuid, integer, text) to service_role;
