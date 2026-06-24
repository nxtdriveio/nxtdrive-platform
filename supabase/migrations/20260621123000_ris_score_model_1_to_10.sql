-- Canonical RIS score model:
-- The product canon uses `N` for not assessed and numeric scores 1..8.
-- Null is accepted for older rows and treated as `N`. Score 8 counts as
-- examenwaardig/completed.

create or replace function public._insert_default_ris_taxonomy()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
begin
  insert into public.ris_versions (name, description, active_from, is_active)
  values (
    'RIS 2.0 - Rijbewijs B',
    'Digitale RIS-leskaart voor Rijbewijs B: 4 modules, 46 scripts en N/1-8 scoremodel.',
    date '2026-01-01',
    true
  )
  on conflict (name) do update
    set description = excluded.description,
        is_active = true
  returning id into v_version_id;

  insert into public.ris_modules (ris_version_id, module_number, title, description, sort_order)
  values
    (v_version_id, 1, 'Voertuigbeheersing', 'Technische bediening en controle van de auto.', 10),
    (v_version_id, 2, 'Eenvoudige verkeerssituaties', 'Basis verkeersdeelname en bijzondere verrichtingen.', 20),
    (v_version_id, 3, 'Complexe verkeerssituaties', 'Zelfstandiger handelen in complexere verkeerssituaties.', 30),
    (v_version_id, 4, 'Verantwoord rijgedrag', 'Veilig, verantwoord en zelfstandig rijden.', 40)
  on conflict (ris_version_id, module_number) do update
    set title = excluded.title,
        description = excluded.description,
        sort_order = excluded.sort_order;

  insert into public.ris_categories (ris_module_id, title, sort_order)
  select m.id, v.title, v.sort_order
    from (values
      (1, 'Controle', 10),
      (1, 'Bediening', 20),
      (2, 'Eenvoudige verkeerssituaties', 10),
      (2, 'Bijzondere verrichtingen', 20),
      (3, 'Verplaatsing', 10),
      (3, 'Bijzondere weggedeelten', 20),
      (4, 'Verantwoord rijgedrag', 10)
    ) as v(module_number, title, sort_order)
    join public.ris_modules m
      on m.ris_version_id = v_version_id
     and m.module_number = v.module_number
  on conflict (ris_module_id, title) do update
    set sort_order = excluded.sort_order;

  insert into public.ris_scripts (
    ris_version_id, module_id, category_id, script_number, code, title, description_short, sort_order
  )
  select v_version_id, m.id, c.id, v.script_number, v.code, v.title, v.description_short, v.script_number
    from (values
      (1, 'Controle', 1, 'M1-S1', 'Controle buiten de auto', 'Buitencontrole voor vertrek.'),
      (1, 'Controle', 2, 'M1-S2', 'Controle in de auto', 'Binnencontrole voor vertrek.'),
      (1, 'Controle', 3, 'M1-S3', 'Instappen', 'Veilig instappen en voorbereiden.'),
      (1, 'Controle', 4, 'M1-S4', 'Uitstappen', 'Veilig uitstappen en afsluiten.'),
      (1, 'Controle', 5, 'M1-S5', 'Zithouding', 'Juiste zithouding en bediening.'),
      (1, 'Controle', 6, 'M1-S6', 'Stuurhouding', 'Juiste hand- en stuurhouding.'),
      (1, 'Controle', 7, 'M1-S7', 'Afstellen spiegels', 'Spiegels correct instellen.'),
      (1, 'Bediening', 8, 'M1-S8', 'Starten en afzetten', 'Voertuig gecontroleerd starten en afzetten.'),
      (1, 'Bediening', 9, 'M1-S9', 'Gas geven', 'Gedoseerd accelereren.'),
      (1, 'Bediening', 10, 'M1-S10', 'Scan', 'Kijk- en verkeersscan opbouwen.'),
      (1, 'Bediening', 11, 'M1-S11', 'Sturen', 'Stuurtechniek toepassen.'),
      (1, 'Bediening', 12, 'M1-S12', 'Positie', 'Positie op de weg aanhouden.'),
      (1, 'Bediening', 13, 'M1-S13', 'Remmen', 'Gedoseerd en veilig remmen.'),
      (1, 'Bediening', 14, 'M1-S14', 'Ontkoppelen', 'Koppeling correct gebruiken.'),
      (1, 'Bediening', 15, 'M1-S15', 'Stoppen', 'Gecontroleerd stoppen.'),
      (1, 'Bediening', 16, 'M1-S16', 'Koppelen', 'Koppelen en aangrijppunt beheersen.'),
      (1, 'Bediening', 17, 'M1-S17', 'Schakelen', 'Schakelen op passend moment.'),
      (1, 'Bediening', 18, 'M1-S18', 'Technische wijze wegrijden', 'Technisch correct wegrijden.'),
      (2, 'Eenvoudige verkeerssituaties', 19, 'M2-S19', 'Wegrijden en stoppen', 'Wegrijden en stoppen in verkeer.'),
      (2, 'Eenvoudige verkeerssituaties', 20, 'M2-S20', 'Volgafstand', 'Veilige volgafstand houden.'),
      (2, 'Eenvoudige verkeerssituaties', 21, 'M2-S21', 'Ruimtekussen', 'Ruimte rondom het voertuig bewaken.'),
      (2, 'Eenvoudige verkeerssituaties', 22, 'M2-S22', 'Tegemoetkomen', 'Tegemoetkomend verkeer verwerken.'),
      (2, 'Eenvoudige verkeerssituaties', 23, 'M2-S23', 'Ingehaald worden', 'Veilig gedrag bij ingehaald worden.'),
      (2, 'Eenvoudige verkeerssituaties', 24, 'M2-S24', 'Kruispunten', 'Eenvoudige kruispunten veilig benaderen.'),
      (2, 'Eenvoudige verkeerssituaties', 25, 'M2-S25', 'Afslaan', 'Afslaan met juiste kijk- en plaatsingsroutine.'),
      (2, 'Bijzondere verrichtingen', 26, 'M2-S26', 'Hellingproef', 'Wegrijden op een helling.'),
      (2, 'Bijzondere verrichtingen', 27, 'M2-S27', 'Achteruitrijden', 'Achteruitrijden in basisvormen.'),
      (2, 'Bijzondere verrichtingen', 28, 'M2-S28', 'Parkeren', 'Parkeren in verschillende situaties.'),
      (2, 'Bijzondere verrichtingen', 29, 'M2-S29', 'Omkeren', 'Omkeren in passende vorm.'),
      (3, 'Verplaatsing', 30, 'M3-S30', 'Rijstrook wisselen en zijdelings verplaatsen', 'Veilig van positie of rijstrook wisselen.'),
      (3, 'Verplaatsing', 31, 'M3-S31', 'Voorbijgaan', 'Veilig voorbijgaan aan obstakels.'),
      (3, 'Verplaatsing', 32, 'M3-S32', 'Inhalen', 'Inhalen voorbereiden en uitvoeren.'),
      (3, 'Verplaatsing', 33, 'M3-S33', 'Invoegen', 'Veilig invoegen.'),
      (3, 'Verplaatsing', 34, 'M3-S34', 'Uitvoegen', 'Veilig uitvoegen.'),
      (3, 'Bijzondere weggedeelten', 35, 'M3-S35', 'Rotondes', 'Rotondes benaderen en berijden.'),
      (3, 'Bijzondere weggedeelten', 36, 'M3-S36', 'Erven', 'Rijden op erven en verblijfsgebieden.'),
      (3, 'Bijzondere weggedeelten', 37, 'M3-S37', 'Spoorwegovergangen', 'Spoorwegovergangen veilig passeren.'),
      (3, 'Bijzondere weggedeelten', 38, 'M3-S38', 'Voetgangersoversteekplaatsen, VOP', 'VOP herkennen en veilig handelen.'),
      (3, 'Bijzondere weggedeelten', 39, 'M3-S39', 'Tram- en bushaltes', 'Haltesituaties veilig verwerken.'),
      (4, 'Verantwoord rijgedrag', 40, 'M4-S40', 'Moeilijke omstandigheden', 'Rijden bij lastige omstandigheden.'),
      (4, 'Verantwoord rijgedrag', 41, 'M4-S41', 'Zelfstandige ritvoorbereiding', 'Zelfstandig ritten voorbereiden.'),
      (4, 'Verantwoord rijgedrag', 42, 'M4-S42', 'ROSO-training, rijden onder specifieke omstandigheden', 'Specifieke omstandigheden veilig toepassen.'),
      (4, 'Verantwoord rijgedrag', 43, 'M4-S43', 'Milieuverantwoord rijden', 'Milieubewust en verantwoord rijden.'),
      (4, 'Verantwoord rijgedrag', 44, 'M4-S44', 'Defensief rijden', 'Defensief, voorspelbaar en veilig rijden.'),
      (4, 'Verantwoord rijgedrag', 45, 'M4-S45', 'Aangepast en besluitvaardig rijden', 'Aangepast en besluitvaardig handelen.'),
      (4, 'Verantwoord rijgedrag', 46, 'M4-S46', 'Mentaliteit en verantwoordelijkheid', 'Verantwoordelijkheid en rijhouding tonen.')
    ) as v(module_number, category_title, script_number, code, title, description_short)
    join public.ris_modules m
      on m.ris_version_id = v_version_id
     and m.module_number = v.module_number
    join public.ris_categories c
      on c.ris_module_id = m.id
     and c.title = v.category_title
  on conflict (ris_version_id, code) do update
    set title = excluded.title,
        description_short = excluded.description_short,
        module_id = excluded.module_id,
        category_id = excluded.category_id,
        script_number = excluded.script_number,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into public.ris_script_variants (script_id, code, title, sort_order)
  select s.id, v.variant_code, v.title, v.sort_order
    from (values
      ('M2-S27', 'M2-S27a', 'Achteruitrijden, rechte lijn', 10),
      ('M2-S27', 'M2-S27b', 'Achteruitrijden, aangegeven bocht', 20),
      ('M2-S29', 'M2-S29a', 'Omkeren, halve draai', 10),
      ('M2-S29', 'M2-S29b', 'Omkeren, steken', 20)
    ) as v(script_code, variant_code, title, sort_order)
    join public.ris_scripts s
      on s.ris_version_id = v_version_id
     and s.code = v.script_code
  on conflict (script_id, code) do update
    set title = excluded.title,
        sort_order = excluded.sort_order,
        is_active = true;

  delete from public.ris_step_definitions
   where ris_version_id = v_version_id
     and step_value in ('9', '10');

  insert into public.ris_step_definitions (
    ris_version_id, step_value, instructor_label, student_label, explanation, phase, sort_order
  )
  values
    (v_version_id, 'N', 'Niet beoordeeld', 'Nog niet beoordeeld', 'Er is nog geen betrouwbare beoordeling vastgelegd.', 'geen score', 0),
    (v_version_id, '1', 'Startniveau', 'Je maakt kennis met dit onderdeel', 'De leerling herkent het onderdeel, maar voert het nog niet betrouwbaar uit.', 'cognitief', 10),
    (v_version_id, '2', 'Met veel hulp', 'Je oefent dit met veel hulp', 'De leerling voert het onderdeel alleen uit met voortdurende aanwijzingen.', 'cognitief', 20),
    (v_version_id, '3', 'Met hulp', 'Je voert dit met hulp uit', 'De leerling begrijpt de opdracht en voert uit met duidelijke begeleiding.', 'cognitief', 30),
    (v_version_id, '4', 'Onder begeleiding', 'Je doet dit al deels zelf', 'De leerling voert delen zelfstandig uit, maar correctie blijft nodig.', 'associatief', 40),
    (v_version_id, '5', 'Redelijk zelfstandig', 'Je rijdt dit redelijk zelfstandig', 'De leerling voert de basis meestal zelfstandig uit met beperkte aanwijzingen.', 'associatief', 50),
    (v_version_id, '6', 'Voldoende', 'Je kunt dit zelfstandig uitvoeren', 'De leerling voert het onderdeel zelfstandig, veilig en voldoende stabiel uit.', 'associatief', 60),
    (v_version_id, '7', 'Goed', 'Je past dit goed toe', 'De leerling past het onderdeel goed toe in verschillende situaties.', 'geautomatiseerd', 70),
    (v_version_id, '8', 'Examenwaardig', 'Je beheerst dit examenwaardig', 'De leerling voert het onderdeel zelfstandig, veilig en examenwaardig uit.', 'geautomatiseerd', 80)
  on conflict (ris_version_id, step_value) do update
    set instructor_label = excluded.instructor_label,
        student_label = excluded.student_label,
        explanation = excluded.explanation,
        phase = excluded.phase,
        sort_order = excluded.sort_order;

  return v_version_id;
end;
$$;

update public.ris_script_assessments
   set previous_ris_step = '8'
 where previous_ris_step in ('9', '10');

update public.ris_script_assessments
   set concept_ris_step = '8'
 where concept_ris_step in ('9', '10');

update public.ris_script_assessments
   set final_ris_step = '8'
 where final_ris_step in ('9', '10');

update public.student_ris_progress
   set current_final_step = '8'
 where current_final_step in ('9', '10');

delete from public.ris_step_definitions
 where step_value in ('9', '10');

create or replace function public._ris_step_numeric(p_step text)
returns smallint
language sql
immutable
as $$
  select case
    when p_step is null or p_step = 'N' then null
    when p_step ~ '^[1-8]$' then p_step::smallint
    else null
  end
$$;

create or replace function public._ris_step_valid(p_step text)
returns boolean
language sql
immutable
as $$
  select p_step is null or p_step = 'N' or p_step ~ '^[1-8]$'
$$;

do $$
begin
  perform public._insert_default_ris_taxonomy();
end $$;

insert into public.ris_step_definitions (
  ris_version_id, step_value, instructor_label, student_label, explanation, phase, sort_order
)
select
  v.id,
  d.step_value,
  d.instructor_label,
  d.student_label,
  d.explanation,
  d.phase,
  d.sort_order
from public.ris_versions v
cross join (values
  ('N', 'Niet beoordeeld', 'Nog niet beoordeeld', 'Er is nog geen betrouwbare beoordeling vastgelegd.', 'geen score', 0),
  ('1', 'Startniveau', 'Je maakt kennis met dit onderdeel', 'De leerling herkent het onderdeel, maar voert het nog niet betrouwbaar uit.', 'cognitief', 10),
  ('2', 'Met veel hulp', 'Je oefent dit met veel hulp', 'De leerling voert het onderdeel alleen uit met voortdurende aanwijzingen.', 'cognitief', 20),
  ('3', 'Met hulp', 'Je voert dit met hulp uit', 'De leerling begrijpt de opdracht en voert uit met duidelijke begeleiding.', 'cognitief', 30),
  ('4', 'Onder begeleiding', 'Je doet dit al deels zelf', 'De leerling voert delen zelfstandig uit, maar correctie blijft nodig.', 'associatief', 40),
  ('5', 'Redelijk zelfstandig', 'Je rijdt dit redelijk zelfstandig', 'De leerling voert de basis meestal zelfstandig uit met beperkte aanwijzingen.', 'associatief', 50),
  ('6', 'Voldoende', 'Je kunt dit zelfstandig uitvoeren', 'De leerling voert het onderdeel zelfstandig, veilig en voldoende stabiel uit.', 'associatief', 60),
  ('7', 'Goed', 'Je past dit goed toe', 'De leerling past het onderdeel goed toe in verschillende situaties.', 'geautomatiseerd', 70),
  ('8', 'Examenwaardig', 'Je beheerst dit examenwaardig', 'De leerling voert het onderdeel zelfstandig, veilig en examenwaardig uit.', 'geautomatiseerd', 80)
) as d(step_value, instructor_label, student_label, explanation, phase, sort_order)
on conflict (ris_version_id, step_value) do update
  set instructor_label = excluded.instructor_label,
      student_label = excluded.student_label,
      explanation = excluded.explanation,
      phase = excluded.phase,
      sort_order = excluded.sort_order;

update public.ris_versions
   set description = regexp_replace(
         coalesce(description, 'Digitale RIS-leskaart voor Rijbewijs B.'),
         ('1-' || '10|1-8') || ' scoremodel',
         'N/1-8 scoremodel',
         'gi'
       )
 where description is null
    or description ~* (('1-' || '10|1-8') || ' scoremodel');

create or replace function public.recompute_student_ris_progress(
  p_tenant_id uuid,
  p_student_id uuid,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  delete from public.student_ris_progress
   where tenant_id = p_tenant_id and student_id = p_student_id;

  insert into public.student_ris_progress (
    tenant_id, student_id, script_id, script_variant_id, current_final_step,
    last_assessed_lesson_id, last_assessed_at, is_attention_point,
    is_completed, ready_for_module_test
  )
  select distinct on (a.script_id)
    a.tenant_id,
    a.student_id,
    a.script_id,
    a.script_variant_id,
    a.final_ris_step,
    a.lesson_id,
    coalesce(c.published_at, a.updated_at),
    a.is_attention_point,
    public._ris_step_numeric(a.final_ris_step) >= 8,
    a.ready_for_test
  from public.ris_script_assessments a
  join public.ris_lesson_cards c
    on c.id = a.lesson_card_id
   and c.tenant_id = a.tenant_id
  join public.lessons l
    on l.id = a.lesson_id
  where a.tenant_id = p_tenant_id
    and a.student_id = p_student_id
    and c.publication_status::text in (
      'published',
      'published_to_student',
      'waiting_for_student_response',
      'fully_completed'
    )
    and a.final_ris_step is not null
  order by a.script_id, l.starts_at desc, a.updated_at desc;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'ris.progress_recomputed', 'student', p_student_id::text, '{}'::jsonb
  );
end;
$$;

comment on function public._ris_step_valid(text) is
  'Canonical RIS score validator. Accepts null, N, or text scores 1 through 8; null and N mean not assessed.';
comment on function public._ris_step_numeric(text) is
  'Converts canonical RIS text scores 1 through 8 to numeric values; null and N remain unassessed.';
comment on column public.ris_script_assessments.previous_ris_step is
  'Previous published RIS score, stored as N or text 1 through 8. Null means not assessed yet.';
comment on column public.ris_script_assessments.concept_ris_step is
  'Draft RIS score, stored as N or text 1 through 8. Null means not assessed yet.';
comment on column public.ris_script_assessments.final_ris_step is
  'Published RIS score, stored as N or text 1 through 8. Null means not assessed yet.';
comment on column public.student_ris_progress.current_final_step is
  'Latest published RIS score, stored as N or text 1 through 8. Null means not assessed yet.';
