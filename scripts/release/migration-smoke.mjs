import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migrationRoot = resolve(root, "supabase/migrations");
const evidenceRoot = resolve(root, "release-evidence/migration-results");
const files = (await readdir(migrationRoot))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const containerName = `nxtdrive-migration-smoke-${process.pid}-${randomBytes(3).toString("hex")}`;
const postgresImage =
  process.env.MIGRATION_SMOKE_POSTGRES_IMAGE ??
  "public.ecr.aws/supabase/postgres:17.6.1.143";
const password = "nxtdrive_migration_smoke";
const firstDatabase = "nxtdrive_smoke_empty";
const secondDatabase = "nxtdrive_smoke_existing";
let containerStarted = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture
      ? ["ignore", "pipe", "pipe"]
      : options.input !== undefined
        ? ["pipe", "inherit", "inherit"]
        : "inherit",
    env: { ...process.env, ...options.env },
    input: options.input,
  });
  if (result.status !== 0) {
    const detail = options.capture
      ? `${result.stdout ?? ""}${result.stderr ?? ""}`
      : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}.\n${detail}`,
    );
  }
  return options.capture ? (result.stdout ?? "").trim() : "";
}

function dockerExec(database, user, sql) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      user,
      "-d",
      database,
    ],
    { input: sql },
  );
}

function bootstrapDatabase(database) {
  dockerExec(
    database,
    "supabase_admin",
    `
      grant all privileges on database ${database} to postgres;
      alter schema public owner to postgres;
      grant all on schema public to postgres;

      create table if not exists storage.buckets (
        id text primary key,
        name text not null unique,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create table if not exists storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets(id),
        name text not null,
        owner uuid,
        metadata jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_accessed_at timestamptz not null default now()
      );
      alter table storage.objects enable row level security;
      grant all on schema storage to postgres;
      grant all on all tables in schema storage to postgres;
    `,
  );
}

function applyMigrations(database, port, maxFile) {
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
  run(
    "pnpm",
    [
      "--filter",
      "@workspace/scripts",
      "run",
      "db:migrate",
      "--",
      "--env=staging",
    ],
    {
      env: {
        STAGING_DATABASE_URL: url,
        DATABASE_URL: url,
        MIGRATION_MAX_FILE: maxFile ?? "",
        NEXT_PUBLIC_SUPABASE_URL: "",
        STAGING_SUPABASE_URL: "",
        SUPABASE_URL: "",
      },
    },
  );
}

const fixtureSql = `
  insert into auth.users (
    id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at
  ) values
    (
      '10000000-0000-4000-8000-000000000001',
      'migration-instructor@example.test',
      '{"full_name":"Migration Instructor"}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '10000000-0000-4000-8000-000000000002',
      'migration-outsider@example.test',
      '{"full_name":"Migration Outsider"}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '10000000-0000-4000-8000-000000000003',
      'migration-platform-admin@example.test',
      '{"full_name":"Migration Platform Admin"}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '10000000-0000-4000-8000-000000000004',
      'migration-student@example.test',
      '{"full_name":"Migration Student"}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
  on conflict (id) do nothing;

  update public.profiles
     set is_platform_admin = true
   where id = '10000000-0000-4000-8000-000000000003';

  insert into public.tenants (id, slug, name)
  values
    ('20000000-0000-4000-8000-000000000001', 'migration-school-a', 'Migration School A'),
    ('20000000-0000-4000-8000-000000000002', 'migration-school-b', 'Migration School B')
  on conflict (id) do nothing;

  insert into public.memberships (user_id, tenant_id, role)
  values (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'instructor'
  )
  on conflict (user_id, tenant_id, role) do nothing;

  insert into public.students (id, tenant_id, user_id, full_name, email)
  values
    (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000004',
      'Fixture Student A',
      null
    ),
    (
      '30000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      null,
      'Fixture Student B',
      null
    )
  on conflict (id) do nothing;

  insert into public.lessons (
    id, tenant_id, instructor_id, student_id, starts_at, ends_at, status
  ) values (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '2026-07-29T08:00:00Z',
    '2026-07-29T09:00:00Z',
    'planned'
  )
  on conflict (id) do nothing;

  insert into public.invoices (
    id, tenant_id, student_id, invoice_no, status, due_date
  ) values (
    '50000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    1,
    'open',
    '2026-08-15'
  )
  on conflict (id) do nothing;
`;

function verifyDatabase(database) {
  dockerExec(
    database,
    "postgres",
    `
      do $verification$
      declare
        migration_count integer;
        rls_count integer;
        unsafe_credit_grant_blocked boolean := false;
        unsafe_catalog_review_blocked boolean := false;
        incomplete_approval_blocked boolean := false;
        unvalidated_activation_blocked boolean := false;
        v_ris_version_id uuid;
        v_curriculum_id uuid;
        v_validation_id uuid;
        v_policy_id uuid;
        v_definition_ids uuid[];
        v_definition_id uuid;
        v_critical_code text;
        v_assessment_type text;
        v_location_record_id uuid;
        v_location_version_id uuid;
        v_updated_location_version_id uuid;
        v_appointment_stop_id uuid;
        v_location_proposal_id uuid;
        v_stop_confirmation_id uuid;
        v_maps_gate jsonb;
        immutable_location_blocked boolean := false;
        cross_tenant_location_blocked boolean := false;
        cross_tenant_wizard_blocked boolean := false;
        wizard_overlap_blocked boolean := false;
        v_wizard_result jsonb;
        v_student_search_count integer;
        catalog_snapshot jsonb;
        catalog_hash text;
      begin
        select count(*) into migration_count from public._migrations;
        if migration_count <> ${files.length} then
          raise exception 'expected ${files.length} migrations, found %', migration_count;
        end if;

        select count(*) into rls_count
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in ('tenants', 'students', 'lessons', 'invoices')
           and c.relrowsecurity;
        if rls_count <> 4 then
          raise exception 'core RLS gate failed: % of 4 tables enabled', rls_count;
        end if;

        if not exists (
          select 1 from pg_constraint
           where conname = 'lessons_student_tenant_fkey'
        ) then
          raise exception 'tenant-consistent lesson/student FK missing';
        end if;
        if not exists (
          select 1 from pg_constraint
           where conname = 'invoices_no_per_tenant_unique'
        ) then
          raise exception 'tenant invoice number uniqueness missing';
        end if;
        if (select count(*) from public.lessons) <> 1 then
          raise exception 'representative lesson fixture missing';
        end if;
        if (select count(*) from public.invoices) <> 1 then
          raise exception 'representative invoice fixture missing';
        end if;
        if not exists (
          select 1
            from public.instructor_training_qualifications
           where tenant_id = '20000000-0000-4000-8000-000000000001'
             and instructor_id = '10000000-0000-4000-8000-000000000001'
             and training_method = 'RIS_2_0'
             and is_qualified = true
        ) then
          raise exception 'default RIS 2.0 instructor qualification missing';
        end if;

        v_location_record_id := public.upsert_student_location(
          '20000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'STUDENT_PICKUP_DEFAULT',
          'Thuis',
          'Oud adres 1, Utrecht'
        );
        select canonical_version_id
          into v_location_version_id
          from public.location_records
         where id = v_location_record_id;
        if v_location_version_id is null then
          raise exception 'canonical student location version was not created';
        end if;

        v_appointment_stop_id := public.publish_appointment_stop(
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'LESSON',
          '40000000-0000-4000-8000-000000000001',
          'PICKUP',
          1,
          v_location_record_id,
          v_location_version_id
        );

        v_location_record_id := public.upsert_student_location(
          '20000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'STUDENT_PICKUP_DEFAULT',
          'Thuis gewijzigd',
          'Nieuw adres 2, Utrecht',
          null,
          null,
          null,
          '3521 AB',
          'Utrecht',
          null,
          'NL',
          52.0907,
          5.1214,
          'USER_ENTERED',
          null,
          null,
          'UNVALIDATED',
          'Profielwijziging na publicatie',
          v_location_record_id
        );
        select canonical_version_id
          into v_updated_location_version_id
          from public.location_records
         where id = v_location_record_id;
        if v_updated_location_version_id = v_location_version_id then
          raise exception 'student location update did not create a new version';
        end if;
        if (
          select formatted_address_snapshot
            from public.appointment_stops
           where id = v_appointment_stop_id
        ) <> 'Oud adres 1, Utrecht' then
          raise exception 'published appointment stop changed with profile location';
        end if;

        begin
          update public.location_versions
             set formatted_address = 'Silent overwrite'
           where id = v_location_version_id;
        exception when others then
          immutable_location_blocked := true;
        end;
        if not immutable_location_blocked then
          raise exception 'immutable location version accepted an update';
        end if;

        v_location_proposal_id := public.propose_appointment_location_change(
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          v_appointment_stop_id,
          v_location_record_id,
          v_updated_location_version_id,
          'Leerling wil voor deze les het nieuwe adres gebruiken'
        );
        if not exists (
          select 1
            from public.location_change_proposals
           where id = v_location_proposal_id
             and status = 'PROPOSED'
        ) then
          raise exception 'student appointment location proposal was not persisted';
        end if;

        v_stop_confirmation_id := public.confirm_student_appointment_stop(
          '20000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          v_appointment_stop_id,
          '10000000-0000-4000-8000-000000000004',
          'STUDENT'
        );
        if not exists (
          select 1
            from public.appointment_stop_confirmations
           where id = v_stop_confirmation_id
             and entry_mode = 'STUDENT'
             and status = 'CONFIRMED'
        ) then
          raise exception 'student stop confirmation was not persisted';
        end if;

        begin
          perform public.upsert_student_location(
            '20000000-0000-4000-8000-000000000002',
            '30000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            'STUDENT_PICKUP_DEFAULT',
            'Cross tenant',
            'Must be rejected'
          );
        exception when others then
          cross_tenant_location_blocked := true;
        end;
        if not cross_tenant_location_blocked then
          raise exception 'cross-tenant student location write was not blocked';
        end if;

        v_maps_gate := public.evaluate_maps_feature_gate(
          '20000000-0000-4000-8000-000000000001',
          'ROUTE_MATRIX',
          'LOCAL',
          1
        );
        if v_maps_gate ->> 'mode' <> 'HAVERSINE'
           or v_maps_gate ->> 'reason' <> 'FEATURE_DISABLED' then
          raise exception 'disabled route matrix did not degrade safely: %', v_maps_gate;
        end if;

        insert into public.maps_tenant_entitlements (
          tenant_id, feature_code, status, configured_by, configuration_reason
        ) values (
          '20000000-0000-4000-8000-000000000001',
          'ROUTE_MATRIX',
          'ENABLED',
          '10000000-0000-4000-8000-000000000003',
          'Migration smoke entitlement'
        );
        insert into public.maps_tenant_limits (
          tenant_id, feature_code, scope_type, period_type,
          soft_limit, hard_limit, degradation_action, created_by
        ) values (
          '20000000-0000-4000-8000-000000000001',
          'ROUTE_MATRIX',
          'FEATURE',
          'MONTH',
          8,
          10,
          'RAYON_OR_HAVERSINE',
          '10000000-0000-4000-8000-000000000003'
        );
        perform public.record_maps_usage_event(
          '20000000-0000-4000-8000-000000000001',
          'LOCAL',
          'ROUTE_MATRIX',
          'PLANNING_BOARD',
          'GOOGLE',
          'routes.matrix',
          'MATRIX_ELEMENT',
          9,
          'MISS',
          'SUCCESS',
          'migration.maps.0001',
          120,
          null
        );
        v_maps_gate := public.evaluate_maps_feature_gate(
          '20000000-0000-4000-8000-000000000001',
          'ROUTE_MATRIX',
          'LOCAL',
          1
        );
        if v_maps_gate ->> 'state' <> 'LIMIT_REACHED'
           or v_maps_gate ->> 'mode' <> 'HAVERSINE' then
          raise exception 'maps hard limit did not enforce safe degradation: %', v_maps_gate;
        end if;
        perform public.rollup_maps_usage_day(current_date);
        if (
          select coalesce(sum(units), 0)
            from public.maps_usage_daily_rollups
           where tenant_id = '20000000-0000-4000-8000-000000000001'
             and usage_date = current_date
             and feature_code = 'ROUTE_MATRIX'
        ) <> 9 then
          raise exception 'maps usage rollup did not preserve matrix elements';
        end if;

        perform public.add_instructor_student_credits(
          '30000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          60,
          'Migration smoke instructor grant'
        );
        if (
          select balance
            from public.student_credit_balance
           where student_id = '30000000-0000-4000-8000-000000000001'
             and tenant_id = '20000000-0000-4000-8000-000000000001'
        ) <> 60 then
          raise exception 'instructor credit grant did not update the balance';
        end if;

        begin
          perform public.add_instructor_student_credits(
            '30000000-0000-4000-8000-000000000002',
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            60,
            'Must be rejected'
          );
        exception when others then
          unsafe_credit_grant_blocked := true;
        end;
        if not unsafe_credit_grant_blocked then
          raise exception 'cross-tenant instructor credit grant was not blocked';
        end if;

        insert into public.appointment_type_policies (
          tenant_id, code, label, short_label, category, student_requirement,
          default_duration_minutes, min_duration_minutes, max_duration_minutes,
          duration_step_minutes, default_buffer_after_minutes,
          location_requirement, vehicle_requirement, route_validation_enabled,
          blocks_instructor_availability, blocks_vehicle_availability,
          calendar_tone, icon_key
        ) values (
          '20000000-0000-4000-8000-000000000001', 'lesson', 'Rijles', 'Rijles',
          'STUDENT', 'REQUIRED', 60, 30, 180, 15, 15, 'PICKUP', 'AUTO', true,
          true, true, 'BLUE', 'car'
        ) on conflict (tenant_id, code) do nothing;
        insert into public.appointment_wizard_settings (
          tenant_id, student_scope, vehicle_required
        ) values (
          '20000000-0000-4000-8000-000000000001', 'OWN_ACTIVE', false
        ) on conflict (tenant_id) do update set vehicle_required = excluded.vehicle_required;

        select count(*) into v_student_search_count
          from public.search_instructor_students(
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Fix', 'OWN_ACTIVE', null, 10
          );
        if v_student_search_count <> 1 then
          raise exception 'smart wizard student search did not preserve own-active scope';
        end if;

        begin
          perform * from public.search_instructor_students(
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            'Fix', 'TENANT_ACTIVE', null, 10
          );
        exception when others then
          cross_tenant_wizard_blocked := true;
        end;
        if not cross_tenant_wizard_blocked then
          raise exception 'cross-tenant smart wizard student search was not blocked';
        end if;
        cross_tenant_wizard_blocked := false;
        begin
          perform public.create_smart_appointment(
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'break', null, '2026-08-03T07:00:00Z', 30, 0, 0, null,
            'Pauze', null, null, null, null, 1, '{}'::jsonb, 'NONE', null,
            null, null, null, null, null, null
          );
        exception when others then
          cross_tenant_wizard_blocked := true;
        end;
        if not cross_tenant_wizard_blocked then
          raise exception 'cross-tenant smart wizard create was not blocked';
        end if;

        v_wizard_result := public.create_smart_appointment(
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'lesson', '30000000-0000-4000-8000-000000000001',
          '2026-08-03T08:00:00Z', 60, 0, 15, null,
          'Rijles', 'Migration Wizardstraat 1', null, null, null, 1,
          '{}'::jsonb, 'NONE', null, null, null,
          jsonb_build_object(
            'formattedAddress', 'Migration Wizardstraat 1, Utrecht',
            'label', 'Tijdelijk ophaalpunt', 'countryCode', 'NL',
            'source', 'USER_ENTERED', 'validationStatus', 'UNVALIDATED'
          ),
          null, null, null
        );
        if not exists (
          select 1 from public.lessons lesson
           where lesson.id = (v_wizard_result->>'id')::uuid
             and lesson.tenant_id = '20000000-0000-4000-8000-000000000001'
             and lesson.ends_at = lesson.starts_at + interval '60 minutes'
             and lesson.buffer_min = 15
             and lesson.appointment_policy_snapshot->>'code' = 'lesson'
        ) then
          raise exception 'smart wizard lesson snapshot or visible duration is incorrect';
        end if;
        if not exists (
          select 1 from public.appointment_stops stop
           where stop.lesson_id = (v_wizard_result->>'id')::uuid
             and stop.stop_type = 'PICKUP'
             and stop.publication_status = 'PUBLISHED'
        ) then
          raise exception 'smart wizard pickup snapshot was not published';
        end if;

        begin
          perform public.create_smart_appointment(
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'lesson', '30000000-0000-4000-8000-000000000001',
            '2026-08-03T08:30:00Z', 60, 0, 15, null,
            'Overlap', 'Migration Wizardstraat 1', null, null, null, 1,
            '{}'::jsonb, 'NONE', null, null, null,
            jsonb_build_object('formattedAddress', 'Migration Wizardstraat 1, Utrecht'),
            null, null, null
          );
        exception when others then
          wizard_overlap_blocked := true;
        end;
        if not wizard_overlap_blocked then
          raise exception 'smart wizard accepted an overlapping lesson';
        end if;

        select id into v_ris_version_id
          from public.ris_versions
         where is_active
         order by active_from desc
         limit 1;
        catalog_snapshot := public.get_ris_catalog_validation_snapshot(v_ris_version_id);
        catalog_hash := catalog_snapshot ->> 'contentHash';
        if nullif(catalog_hash, '') is null
           or jsonb_array_length(catalog_snapshot -> 'document' -> 'modules') <> 4
           or jsonb_array_length(catalog_snapshot -> 'document' -> 'steps') <> 9
           or (
             select count(*)
             from public.ris_scripts script
              where script.ris_version_id = v_ris_version_id
                and script.is_active
           ) <> 46 then
          raise exception 'RIS catalog validation snapshot is incomplete';
        end if;

        begin
          perform public.review_ris_catalog(
            v_ris_version_id,
            '10000000-0000-4000-8000-000000000002',
            catalog_hash,
            'IN_REVIEW',
            null,
            '[]'::jsonb,
            null,
            'Must be rejected'
          );
        exception when others then
          unsafe_catalog_review_blocked := true;
        end;
        if not unsafe_catalog_review_blocked then
          raise exception 'non-platform RIS catalog review was not blocked';
        end if;

        begin
          insert into public.expert_validation_records (
            target_type,
            target_id,
            status,
            content_hash
          ) values (
            'CURRICULUM',
            gen_random_uuid(),
            'APPROVED',
            'incomplete-direct-approval'
          );
        exception when others then
          incomplete_approval_blocked := true;
        end;
        if not incomplete_approval_blocked then
          raise exception 'incomplete direct expert approval was not blocked';
        end if;

        v_validation_id := public.review_ris_catalog(
          v_ris_version_id,
          '10000000-0000-4000-8000-000000000003',
          catalog_hash,
          'APPROVED',
          'Migration smoke RIS expert',
          jsonb_build_array(
            jsonb_build_object('key', 'catalog_structure', 'passed', true),
            jsonb_build_object('key', 'script_content', 'passed', true),
            jsonb_build_object('key', 'step_content', 'passed', true),
            jsonb_build_object('key', 'module_test_logic', 'passed', true),
            jsonb_build_object('key', 'source_rights', 'passed', true)
          ),
          null,
          'Behavioral migration smoke approval'
        );
        select id into v_curriculum_id
          from public.curriculum_versions
         where source_ris_version_id = v_ris_version_id;
        if not exists (
          select 1
            from public.expert_validation_records validation
            join public.curriculum_versions curriculum
              on curriculum.expert_validation_record_id = validation.id
           where validation.id = v_validation_id
             and validation.status = 'APPROVED'
             and validation.content_hash = catalog_hash
             and curriculum.id = v_curriculum_id
             and curriculum.content_hash = catalog_hash
        ) then
          raise exception 'RIS expert approval was not bound to the current content hash';
        end if;

        begin
          perform public.set_tenant_ris_settings(
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000003',
            'ris',
            v_ris_version_id,
            false
          );
        exception when others then
          unvalidated_activation_blocked := true;
        end;
        if not unvalidated_activation_blocked then
          raise exception 'RIS activation bypassed unpublished curriculum/policy gates';
        end if;

        v_policy_id := public.configure_ris_readiness_policy(
          v_curriculum_id,
          '10000000-0000-4000-8000-000000000003',
          array['M1-S1'],
          2,
          2,
          3,
          2,
          90,
          'Behavioral readiness policy smoke'
        );
        perform public.review_ris_readiness_policy(
          v_policy_id,
          '10000000-0000-4000-8000-000000000003',
          (select content_hash from public.readiness_policies where id = v_policy_id),
          'APPROVED',
          'Migration smoke readiness expert',
          jsonb_build_array(
            jsonb_build_object('key', 'separate_dimensions', 'passed', true),
            jsonb_build_object('key', 'critical_safety', 'passed', true),
            jsonb_build_object('key', 'prerequisites', 'passed', true),
            jsonb_build_object('key', 'stability', 'passed', true),
            jsonb_build_object('key', 'explainability', 'passed', true)
          ),
          null
        );
        perform public.publish_readiness_policy(
          v_policy_id,
          '10000000-0000-4000-8000-000000000003'
        );

        v_definition_ids := public.initialize_ris_assessment_definitions(
          v_curriculum_id,
          '10000000-0000-4000-8000-000000000003'
        );
        foreach v_definition_id in array v_definition_ids loop
          select assessment_type
            into v_assessment_type
            from public.assessment_definitions
           where id = v_definition_id;
          select script.code
            into v_critical_code
            from public.ris_scripts script
            join public.ris_modules module on module.id = script.module_id
           where script.ris_version_id = v_ris_version_id
             and module.module_number = right(v_assessment_type, 1)::integer
             and script.is_active
           order by script.sort_order, script.script_number
           limit 1;
          perform public.configure_ris_assessment_definition(
            v_definition_id,
            '10000000-0000-4000-8000-000000000003',
            array[v_critical_code],
            'Behavioral module assessment smoke'
          );
          perform public.review_ris_assessment_definition(
            v_definition_id,
            '10000000-0000-4000-8000-000000000003',
            (
              select content_hash
                from public.assessment_definitions
               where id = v_definition_id
            ),
            'APPROVED',
            'Migration smoke assessment expert',
            jsonb_build_array(
              jsonb_build_object('key', 'criteria_coverage', 'passed', true),
              jsonb_build_object('key', 'safety_criteria', 'passed', true),
              jsonb_build_object('key', 'decision_rules', 'passed', true),
              jsonb_build_object('key', 'student_feedback', 'passed', true),
              jsonb_build_object('key', 'source_alignment', 'passed', true)
            ),
            null
          );
          perform public.publish_assessment_definition(
            v_definition_id,
            '10000000-0000-4000-8000-000000000003'
          );
        end loop;

        perform public.publish_curriculum_version(
          v_curriculum_id,
          '10000000-0000-4000-8000-000000000003'
        );
        perform public.set_tenant_ris_settings(
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000003',
          'ris',
          v_ris_version_id,
          false
        );
        if not exists (
          select 1
            from public.tenant_ris_settings settings
           where settings.tenant_id = '20000000-0000-4000-8000-000000000001'
             and settings.lesson_card_mode = 'ris'
             and settings.active_ris_version_id = v_ris_version_id
             and settings.ai_assist_enabled = false
        ) then
          raise exception 'fully validated RIS release was not activated';
        end if;
      end
      $verification$;

      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
      do $rls$
      begin
        if (select count(*) from public.students) <> 1 then
          raise exception 'RLS did not isolate students to the fixture tenant';
        end if;
        if (select count(*) from public.lessons) <> 2 then
          raise exception 'RLS hid the authorized lesson';
        end if;
        if (select count(*) from public.invoices) <> 1 then
          raise exception 'RLS hid the authorized invoice';
        end if;
      end
      $rls$;
      rollback;
    `,
  );
}

const entries = [];
for (const file of files) {
  const sql = await readFile(resolve(migrationRoot, file), "utf8");
  if (sql.trim().length === 0) throw new Error(`${file} is empty.`);
  if (/^(?:<{7}|={7}|>{7})/m.test(sql)) {
    throw new Error(`${file} contains a merge-conflict marker.`);
  }
  entries.push({
    file,
    sha256: createHash("sha256").update(sql).digest("hex"),
    bytes: Buffer.byteLength(sql),
  });
}

try {
  if (process.env.MIGRATION_SMOKE_DATABASE_URL) {
    throw new Error(
      "MIGRATION_SMOKE_DATABASE_URL mode is intentionally disabled: the gate requires two disposable databases and will not mutate an unresolved external target.",
    );
  }
  run("docker", [
    "run",
    "--rm",
    "--detach",
    "--name",
    containerName,
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "--env",
    `POSTGRES_DB=${firstDatabase}`,
    "--publish",
    "127.0.0.1::5432",
    postgresImage,
  ]);
  containerStarted = true;

  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const health = spawnSync(
      "docker",
      [
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
        containerName,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).stdout?.trim();
    if (health === "healthy") {
      ready = true;
      break;
    }
    if (health === "none") {
      const result = spawnSync(
        "docker",
        [
          "exec",
          containerName,
          "pg_isready",
          "-U",
          "postgres",
          "-d",
          firstDatabase,
        ],
        { stdio: "ignore" },
      );
      if (result.status === 0 && attempt > 5) {
        ready = true;
        break;
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");

  bootstrapDatabase(firstDatabase);
  run("docker", [
    "exec",
    containerName,
    "createdb",
    "-U",
    "supabase_admin",
    "--template",
    firstDatabase,
    "--owner",
    "postgres",
    secondDatabase,
  ]);

  const portOutput = run("docker", ["port", containerName, "5432/tcp"], {
    capture: true,
  });
  const port = portOutput.match(/:(\d+)$/)?.[1];
  if (!port)
    throw new Error(`Unable to resolve PostgreSQL port: ${portOutput}`);

  const finalMigration = files.at(-1);
  if (!finalMigration) throw new Error("At least one migration is required.");
  applyMigrations(firstDatabase, port, finalMigration);
  dockerExec(firstDatabase, "postgres", fixtureSql);
  verifyDatabase(firstDatabase);

  const penultimateMigration = files.at(-2);
  if (!penultimateMigration)
    throw new Error("At least two migrations are required.");
  applyMigrations(secondDatabase, port, penultimateMigration);
  dockerExec(secondDatabase, "postgres", fixtureSql);
  applyMigrations(secondDatabase, port, finalMigration);
  verifyDatabase(secondDatabase);

  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(
    resolve(evidenceRoot, "migration-manifest.json"),
    `${JSON.stringify(
      {
        mode: "disposable-postgres-empty-and-existing-fixture",
        postgresImage,
        emptyDatabase: "passed",
        existingFixtureUpgrade: "passed",
        migrationCount: entries.length,
        fixture: {
          tenants: 2,
          users: 3,
          memberships: 1,
          students: 2,
          lessons: 1,
          smartWizardLessonsCreated: 1,
          invoices: 1,
        },
        checks: [
          "all migrations applied",
          "core RLS enabled",
          "tenant-consistent foreign keys",
          "invoice uniqueness",
          "authorized tenant visibility",
          "cross-tenant isolation",
          "smart appointment search/create authorization and overlap",
          "smart appointment duration, buffer, policy and location snapshots",
          "instructor credit grant authorization and balance",
          "RIS catalog canonical snapshot and hash",
          "RIS expert review authorization and immutable approval",
          "RIS activation publication gates",
          "RIS readiness policy review and publication",
          "RIS module assessment review and publication",
          "RIS curriculum publication and tenant activation",
        ],
        entries,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Migration smoke passed: ${files.length} migrations on an empty database and an existing populated fixture.`,
  );
} finally {
  if (containerStarted) {
    spawnSync("docker", ["rm", "--force", containerName], {
      cwd: root,
      stdio: "ignore",
    });
  }
}
