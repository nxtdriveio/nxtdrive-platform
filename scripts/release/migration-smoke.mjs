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
    )
  on conflict (id) do nothing;

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

  insert into public.students (id, tenant_id, full_name, email)
  values
    (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'Fixture Student A',
      null
    ),
    (
      '30000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
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
        if (select count(*) from public.lessons) <> 1 then
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
          users: 2,
          memberships: 1,
          students: 2,
          lessons: 1,
          invoices: 1,
        },
        checks: [
          "all migrations applied",
          "core RLS enabled",
          "tenant-consistent foreign keys",
          "invoice uniqueness",
          "authorized tenant visibility",
          "cross-tenant isolation",
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
