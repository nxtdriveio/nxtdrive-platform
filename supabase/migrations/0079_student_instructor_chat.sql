-- ============================================================================
-- 0079_student_instructor_chat.sql
--
-- Task #115 — Berichten: tweerichtingschat tussen leerling en instructeur.
--
-- Een gesprek (chat_conversations) is gebonden aan exact één (tenant, leerling,
-- instructeur)-paar. Berichten (chat_messages) hangen onder een gesprek. De
-- leerling-instructeur-relatie loopt operationeel via `lessons`
-- (lessons.student_id + lessons.instructor_id); dit gesprek materialiseert die
-- relatie als een aanspreekpunt.
--
-- Invarianten (spiegelt 0073 in-app meldingen + de rest van het schema):
--   * Elke rij is tenant-scoped (tenant_id) met RLS + indexes vanaf dag één.
--   * RLS is SELECT-only. Een gebruiker ziet uitsluitend gesprekken/berichten
--     waar hij bij hoort: de eigenaar-leerling (students.user_id), een gekoppelde
--     voogd (student_guardians), de toegewezen instructeur (instructor_id) of
--     een tenant_admin van diezelfde tenant. Geen brede `tenant_id in
--     (my_tenant_ids())`-tak — die zou chats van andere leden lekken.
--   * Alle schrijfacties lopen via SECURITY DEFINER RPC's die ALLEEN voor
--     service_role uitvoerbaar zijn (execute revoked van anon/authenticated).
--     Er zijn bewust geen INSERT/UPDATE/DELETE policies.
--   * De server action stuurt de actor door; de RPC her-valideert het
--     eigenaarschap en leidt de afzenderkant (student/instructeur) zelf af —
--     de client kan de kant niet vervalsen.
--   * Ongelezen-status leeft per kant op het gesprek (student_last_read_at /
--     instructor_last_read_at). Markeer-als-gelezen raakt alleen die kolom; geen
--     destructieve herschrijving, geen DELETE.
--   * Berichten worden NIET per stuk in audit_log gezet (volume); alleen het
--     aanmaken van een gesprek wordt geaudit. Schrijfpad is sowieso service-role
--     only en idempotent op het uniek-paar.
-- ============================================================================

-- Tables --------------------------------------------------------------------

create table if not exists public.chat_conversations (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  student_id              uuid not null,
  instructor_id           uuid not null references auth.users(id) on delete cascade,
  last_message_at         timestamptz,
  last_message_preview    text,
  student_last_read_at    timestamptz,
  instructor_last_read_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- Tenant-consistente FK: de leerling moet bij dezelfde tenant horen.
  constraint chat_conversations_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  constraint chat_conversations_unique unique (tenant_id, student_id, instructor_id)
);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_user_id  uuid not null references auth.users(id) on delete cascade,
  sender_side     text not null check (sender_side in ('student', 'instructor')),
  body            text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  created_at      timestamptz not null default now()
);

drop trigger if exists chat_conversations_set_updated_at on public.chat_conversations;
create trigger chat_conversations_set_updated_at
  before update on public.chat_conversations
  for each row execute function public.set_updated_at();

-- Indexes -------------------------------------------------------------------
-- Instructeur-inbox: "mijn gesprekken, laatste activiteit eerst".
create index if not exists idx_chat_conversations_instructor
  on public.chat_conversations (tenant_id, instructor_id, last_message_at desc);
-- Leerling-kant: gesprek(ken) van deze leerling.
create index if not exists idx_chat_conversations_student
  on public.chat_conversations (tenant_id, student_id, last_message_at desc);
-- Threadweergave + ongelezen-telling: berichten op volgorde binnen een gesprek.
create index if not exists idx_chat_messages_conversation
  on public.chat_messages (conversation_id, created_at);

-- Access helper -------------------------------------------------------------
-- True wanneer p_actor het gesprek mag zien/gebruiken: eigenaar-leerling,
-- gekoppelde voogd, de toegewezen instructeur, of een tenant_admin van dezelfde
-- tenant. SECURITY DEFINER zodat de RLS-policy de onderliggende tabellen mag
-- bevragen zonder zelf op RLS te stuiten. Intrinsiek aan auth.uid() gebonden via
-- de aanroep in de policy.
create or replace function public._chat_actor_can_access(
  p_conversation_id uuid,
  p_actor           uuid
) returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.chat_conversations c
     where c.id = p_conversation_id
       and (
         exists (
           select 1 from public.students s
            where s.id = c.student_id
              and s.tenant_id = c.tenant_id
              and s.user_id = p_actor
         )
         or exists (
           select 1 from public.student_guardians g
            where g.student_id = c.student_id
              and g.tenant_id = c.tenant_id
              and g.user_id = p_actor
         )
         or c.instructor_id = p_actor
         or exists (
           select 1 from public.memberships m
            where m.user_id = p_actor
              and m.tenant_id = c.tenant_id
              and m.role = 'tenant_admin'
         )
       )
  );
$$;

revoke all on function public._chat_actor_can_access(uuid, uuid) from public;
grant execute on function public._chat_actor_can_access(uuid, uuid) to authenticated, service_role;

-- RLS -----------------------------------------------------------------------
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
  for select
  using (public._chat_actor_can_access(id, auth.uid()));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select
  using (public._chat_actor_can_access(conversation_id, auth.uid()));

-- RPCs ----------------------------------------------------------------------

-- _chat_actor_side: leidt de afzenderkant af voor een actor op een gesprek.
-- Returnt 'student' (eigenaar-leerling of voogd), 'instructor' (toegewezen
-- instructeur of tenant_admin) of NULL (niet geautoriseerd). De leerling-tak
-- wint zodat de leerling altijd als zijn eigen kant telt.
create or replace function public._chat_actor_side(
  p_conversation_id uuid,
  p_actor           uuid
) returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_student_id uuid;
  v_tenant_id  uuid;
  v_instructor uuid;
begin
  select student_id, tenant_id, instructor_id
    into v_student_id, v_tenant_id, v_instructor
    from public.chat_conversations
   where id = p_conversation_id;
  if v_student_id is null then
    return null;
  end if;

  if exists (
        select 1 from public.students s
         where s.id = v_student_id and s.tenant_id = v_tenant_id and s.user_id = p_actor
      )
     or exists (
        select 1 from public.student_guardians g
         where g.student_id = v_student_id and g.tenant_id = v_tenant_id and g.user_id = p_actor
      )
  then
    return 'student';
  end if;

  if v_instructor = p_actor
     or exists (
        select 1 from public.memberships m
         where m.user_id = p_actor and m.tenant_id = v_tenant_id and m.role = 'tenant_admin'
      )
  then
    return 'instructor';
  end if;

  return null;
end;
$$;

revoke all on function public._chat_actor_side(uuid, uuid) from public;
grant execute on function public._chat_actor_side(uuid, uuid) to service_role;

-- ensure_chat_conversation: idempotent een gesprek aanmaken/ophalen voor een
-- (tenant, leerling, instructeur)-paar. Her-valideert dat de actor erbij hoort
-- en dat de instructeur daadwerkelijk staf in de tenant is. Bij een herhaalde
-- aanroep wordt de bestaande rij teruggegeven (uniek-paar).
create or replace function public.ensure_chat_conversation(
  p_tenant_id     uuid,
  p_student_id    uuid,
  p_instructor_id uuid,
  p_actor         uuid
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id        uuid;
  v_is_owner  boolean;
  v_is_staff  boolean;
begin
  if p_tenant_id is null or p_student_id is null
     or p_instructor_id is null or p_actor is null then
    raise exception 'tenant_id, student_id, instructor_id and actor are required';
  end if;

  -- De leerling moet bij de tenant horen.
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- De instructeur moet staf in de tenant zijn.
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'user % is not an instructor in tenant %', p_instructor_id, p_tenant_id;
  end if;

  -- Autorisatie: de eigenaar-leerling/voogd, of staf van de tenant.
  v_is_owner := exists (
      select 1 from public.students s
       where s.id = p_student_id and s.tenant_id = p_tenant_id and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = p_student_id and g.tenant_id = p_tenant_id and g.user_id = p_actor
    );
  v_is_staff := exists (
      select 1 from public.memberships m
       where m.user_id = p_actor and m.tenant_id = p_tenant_id
         and m.role in ('instructor', 'tenant_admin')
    );
  if not (v_is_owner or v_is_staff) then
    raise exception 'actor % not authorized to open a conversation', p_actor;
  end if;

  insert into public.chat_conversations (tenant_id, student_id, instructor_id)
  values (p_tenant_id, p_student_id, p_instructor_id)
  on conflict (tenant_id, student_id, instructor_id) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'chat_conversation.created', 'chat_conversation', v_id::text,
      jsonb_build_object('student_id', p_student_id, 'instructor_id', p_instructor_id)
    );
  else
    select id into v_id
      from public.chat_conversations
     where tenant_id = p_tenant_id
       and student_id = p_student_id
       and instructor_id = p_instructor_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_chat_conversation(uuid, uuid, uuid, uuid) from public;
revoke execute on function public.ensure_chat_conversation(uuid, uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.ensure_chat_conversation(uuid, uuid, uuid, uuid) to service_role;

-- send_chat_message: voeg een bericht toe aan een gesprek. De RPC leidt de
-- afzenderkant zelf af (via _chat_actor_side) en weigert een niet-betrokken
-- actor. Werkt de gespreksmetadata bij (last_message_at/preview) en zet de
-- last_read_at van de AFZENDER op now() zodat zijn eigen bericht voor hemzelf
-- nooit als ongelezen telt.
create or replace function public.send_chat_message(
  p_tenant_id       uuid,
  p_conversation_id uuid,
  p_actor           uuid,
  p_body            text
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_conv    record;
  v_side    text;
  v_body    text;
  v_msg_id  uuid;
begin
  if p_tenant_id is null or p_conversation_id is null or p_actor is null then
    raise exception 'tenant_id, conversation_id and actor are required';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'message body must not be empty';
  end if;
  if length(v_body) > 4000 then
    raise exception 'message body too long (max 4000 chars)';
  end if;

  select id, tenant_id, student_id, instructor_id
    into v_conv
    from public.chat_conversations
   where id = p_conversation_id and tenant_id = p_tenant_id
   for update;
  if v_conv.id is null then
    raise exception 'conversation % not found in tenant %', p_conversation_id, p_tenant_id;
  end if;

  v_side := public._chat_actor_side(p_conversation_id, p_actor);
  if v_side is null then
    raise exception 'actor % not authorized for conversation %', p_actor, p_conversation_id;
  end if;

  insert into public.chat_messages (
    tenant_id, conversation_id, sender_user_id, sender_side, body
  ) values (
    p_tenant_id, p_conversation_id, p_actor, v_side, v_body
  )
  returning id into v_msg_id;

  update public.chat_conversations
     set last_message_at      = now(),
         last_message_preview = left(v_body, 140),
         student_last_read_at = case when v_side = 'student'
                                     then now() else student_last_read_at end,
         instructor_last_read_at = case when v_side = 'instructor'
                                        then now() else instructor_last_read_at end
   where id = p_conversation_id and tenant_id = p_tenant_id;

  return v_msg_id;
end;
$$;

revoke all on function public.send_chat_message(uuid, uuid, uuid, text) from public;
revoke execute on function public.send_chat_message(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.send_chat_message(uuid, uuid, uuid, text) to service_role;

-- mark_chat_read: zet de last_read_at van de actor-kant op now(). Re-valideert
-- het eigenaarschap; idempotent.
create or replace function public.mark_chat_read(
  p_tenant_id       uuid,
  p_conversation_id uuid,
  p_actor           uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_side text;
begin
  if p_tenant_id is null or p_conversation_id is null or p_actor is null then
    raise exception 'tenant_id, conversation_id and actor are required';
  end if;

  if not exists (
    select 1 from public.chat_conversations
     where id = p_conversation_id and tenant_id = p_tenant_id
  ) then
    raise exception 'conversation % not found in tenant %', p_conversation_id, p_tenant_id;
  end if;

  v_side := public._chat_actor_side(p_conversation_id, p_actor);
  if v_side is null then
    raise exception 'actor % not authorized for conversation %', p_actor, p_conversation_id;
  end if;

  update public.chat_conversations
     set student_last_read_at = case when v_side = 'student'
                                     then now() else student_last_read_at end,
         instructor_last_read_at = case when v_side = 'instructor'
                                        then now() else instructor_last_read_at end
   where id = p_conversation_id and tenant_id = p_tenant_id;
end;
$$;

revoke all on function public.mark_chat_read(uuid, uuid, uuid) from public;
revoke execute on function public.mark_chat_read(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.mark_chat_read(uuid, uuid, uuid) to service_role;
