import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  process.cwd(),
  "../../supabase/migrations/20260811233933_smart_appointment_wizard_foundation.sql",
);

async function migration() {
  return readFile(migrationPath, "utf8");
}

test("student search RPC is bounded, active, scoped and tenant isolated", async () => {
  const sql = await migration();
  assert.match(sql, /char_length\(v_query\) < 3/);
  assert.match(sql, /least\(10, greatest\(1, coalesce\(p_limit, 10\)\)\)/);
  assert.match(sql, /student\.tenant_id = p_tenant_id/);
  assert.match(sql, /student\.active = true/);
  assert.match(sql, /p_scope\s+in \('OWN_ACTIVE', 'OWN_AND_REPLACEMENT'\)/);
  assert.match(sql, /membership\.tenant_id = p_tenant_id/);
  assert.match(
    sql,
    /revoke all on function public\.search_instructor_students[\s\S]*from public, anon, authenticated/,
  );
});

test("atomic create reauthorizes every referenced tenant entity and serializes resources", async () => {
  const sql = await migration();
  for (const resource of ["instructor", "student", "vehicle"]) {
    assert.match(sql, new RegExp(`pg_advisory_xact_lock\\([^;]+:${resource}:`));
  }
  assert.match(sql, /student\.tenant_id = p_tenant_id/);
  assert.match(sql, /vehicle\.tenant_id = p_tenant_id/);
  assert.match(sql, /branch\.tenant_id = p_tenant_id/);
  assert.match(sql, /area\.tenant_id = p_tenant_id/);
  assert.match(sql, /tstzrange\(v_block_starts_at, v_block_ends_at, '\[\)'\)/);
  assert.match(sql, /student has an overlapping appointment/);
  assert.match(sql, /vehicle is not available/);
});

test("create stores immutable policy and location snapshots without extending visible event time by its buffer", async () => {
  const sql = await migration();
  assert.match(sql, /appointment_policy_snapshot/);
  assert.match(sql, /vehicle_resolution_source/);
  assert.match(sql, /publish_appointment_stop/);
  assert.match(
    sql,
    /v_appointment_ends_at := p_starts_at \+ make_interval\(mins => p_duration_minutes\)/,
  );
  assert.match(
    sql,
    /v_block_ends_at := v_appointment_ends_at \+ make_interval\(mins => p_buffer_after_minutes\)/,
  );
  assert.match(
    sql,
    /revoke all on function public\.create_smart_appointment[\s\S]*from public, anon, authenticated/,
  );
});
