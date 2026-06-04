/**
 * Seed 50-75 scenario accounts on the fixed test-tenant in Supabase.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run db:seed-scenarios -- --env=staging
 *   pnpm --filter @workspace/scripts run db:seed-scenarios -- --env=production
 *
 * Environment secrets required:
 *   staging:    SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   production: PRODUCTION_SUPABASE_URL + PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
 *
 * Fixed test-tenant: 926d29c2-4d77-4ab9-824b-f566725f9ae9
 *
 * Accounts created (password = username):
 *   tenantadmin1@nxtdrive.io … tenantadmin3@nxtdrive.io  (password: tenantadmin<N>)
 *   instructeur1@nxtdrive.io … instructeur8@nxtdrive.io  (password: instructeur<N>)
 *   leerling1@nxtdrive.io    … leerling40@nxtdrive.io    (password: leerling<N>)
 *   ouder1@nxtdrive.io       … ouder15@nxtdrive.io       (password: ouder<N>)
 *
 * Fully idempotent — safe to re-run. Second run logs "already exists".
 */

import { createHash } from "crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  parseEnvFromArgv,
  resolveSupabaseAdminClient,
  bannerFor,
} from "./lib/db-env.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed production test-tenant. Override with --tenant-id=<uuid> for testing. */
const PRODUCTION_TEST_TENANT_ID = "926d29c2-4d77-4ab9-824b-f566725f9ae9";

/** Active test tenant — set at startup from CLI args. */
let TEST_TENANT_ID = PRODUCTION_TEST_TENANT_ID;

/** Instructor workload distribution — indices 0-7 map to instructeur1-8. */
const INSTRUCTOR_STUDENT_RANGES: [number, number][] = [
  [0, 7],   // instructeur1: 8 students (leerling1-8)
  [8, 14],  // instructeur2: 7 students (leerling9-15)
  [15, 20], // instructeur3: 6 students (leerling16-21)
  [21, 26], // instructeur4: 6 students (leerling22-27)
  [27, 31], // instructeur5: 5 students (leerling28-32)
  [32, 35], // instructeur6: 4 students (leerling33-36)
  [36, 38], // instructeur7: 3 students (leerling37-39)
  [39, 39], // instructeur8: 1 student  (leerling40)
];

/** Which student indices (0-based) are linked to a parent (ouder). 14 total. */
const GUARDIAN_STUDENT_INDICES = [0, 2, 5, 7, 9, 11, 14, 17, 20, 24, 27, 30, 33, 37];

/** Phase 5-11 lifecycle bucket for each of the 40 student indices (0-based).
 *  Distribution: 6 / 8 / 6 / 5 / 5 / 4 / 6 = 40
 */
function phaseForStudent(idx: number): 5 | 6 | 7 | 8 | 9 | 10 | 11 {
  if (idx <= 5)  return 5;  //  6 students (0-5):   nieuwe leerling
  if (idx <= 13) return 6;  //  8 students (6-13):  actieve mid-training
  if (idx <= 19) return 7;  //  6 students (14-19): klaar voor examen
  if (idx <= 24) return 8;  //  5 students (20-24): examen in agenda
  if (idx <= 29) return 9;  //  5 students (25-29): geslaagd
  if (idx <= 33) return 10; //  4 students (30-33): gezakt, herexamen
  return 11;                //  6 students (34-39): slapend / inactief
}

/** Deterministic lead ID for each active student (phases 5-10). Null for slapend. */
function studentLeadId(idx: number): string | null {
  if (phaseForStudent(idx) === 11) return null;
  return nameUuid(`student-converted-lead-${idx}`);
}

// ---------------------------------------------------------------------------
// Deterministic UUID helper
// ---------------------------------------------------------------------------

function nameUuid(name: string): string {
  const h = createHash("md5")
    .update(`nxtdrive-seed-v1:${name}`)
    .digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    (((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) +
      h.slice(18, 20)),
    h.slice(20, 32),
  ].join("-");
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const NOW = new Date();

function daysAgo(n: number, hour = 10): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function daysFromNow(n: number, hour = 10): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

// ---------------------------------------------------------------------------
// Auth upsert (mirrors seed-dev-accounts.ts pattern)
// ---------------------------------------------------------------------------

async function findUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function upsertAuthUser(
  supabase: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!error && data.user) {
    return { id: data.user.id, created: true };
  }

  const existingId = await findUserByEmail(supabase, email);
  if (!existingId) {
    throw new Error(
      `Failed to create ${email}: ${error?.message ?? "unknown error"}`,
    );
  }

  await supabase.auth.admin.updateUserById(existingId, {
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  return { id: existingId, created: false };
}

// ---------------------------------------------------------------------------
// DB upsert helpers
// ---------------------------------------------------------------------------

async function upsertProfile(
  supabase: SupabaseClient,
  id: string,
  email: string,
  fullName: string,
  isPlatformAdmin = false,
): Promise<void> {
  const { error } = await supabase.from("profiles").upsert(
    { id, email, full_name: fullName, is_platform_admin: isPlatformAdmin },
    { onConflict: "id" },
  );
  if (error) throw new Error(`profile ${email}: ${error.message}`);
}

async function upsertMembership(
  supabase: SupabaseClient,
  userId: string,
  role: string,
): Promise<void> {
  const { error } = await supabase.from("memberships").upsert(
    { user_id: userId, tenant_id: TEST_TENANT_ID, role },
    { onConflict: "user_id,tenant_id,role" },
  );
  if (error) throw new Error(`membership ${userId}/${role}: ${error.message}`);
}

async function upsertStudent(
  supabase: SupabaseClient,
  userId: string,
  fullName: string,
  email: string,
  leadId: string | null = null,
  active = true,
): Promise<string> {
  // Upsert and return the student id
  const { error } = await supabase.from("students").upsert(
    {
      tenant_id: TEST_TENANT_ID,
      user_id: userId,
      lead_id: leadId,
      full_name: fullName,
      email,
      active,
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (error) throw new Error(`student ${email}: ${error.message}`);

  const { data, error: sel } = await supabase
    .from("students")
    .select("id")
    .eq("tenant_id", TEST_TENANT_ID)
    .eq("user_id", userId)
    .single<{ id: string }>();
  if (sel || !data) throw new Error(`student select ${email}: ${sel?.message}`);
  return data.id;
}

async function creditExists(
  supabase: SupabaseClient,
  studentId: string,
  relatedId: string,
  reason: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("credit_ledger")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TEST_TENANT_ID)
    .eq("student_id", studentId)
    .eq("related_id", relatedId)
    .eq("reason", reason);
  return (count ?? 0) > 0;
}

/**
 * Insert a lead_event row idempotently.
 * lead_events is insert-only (trigger blocks UPDATE/DELETE), so we must
 * existence-check by ID and skip if already present — never upsert.
 * Returns true if the row was inserted, false if already existed.
 */
async function insertLeadEvent(
  supabase: SupabaseClient,
  id: string,
  leadId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actorUserId: string,
  createdAt: Date,
): Promise<boolean> {
  const { count, error: chkErr } = await supabase
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("id", id);
  if (chkErr) throw new Error(`lead_event check ${id}: ${chkErr.message}`);
  if ((count ?? 0) > 0) return false; // already exists — skip silently

  const { error } = await supabase.from("lead_events").insert({
    id,
    lead_id: leadId,
    tenant_id: TEST_TENANT_ID,
    actor_user_id: actorUserId,
    event_type: eventType,
    payload,
    created_at: createdAt.toISOString(),
  });
  if (error) throw new Error(`lead_event insert ${id}: ${error.message}`);
  return true;
}

async function insertCredit(
  supabase: SupabaseClient,
  studentId: string,
  delta: number,
  reason: string,
  relatedType: string,
  relatedId: string,
  note: string,
  actorId: string,
): Promise<void> {
  if (await creditExists(supabase, studentId, relatedId, reason)) return;
  const { error } = await supabase.from("credit_ledger").insert({
    tenant_id: TEST_TENANT_ID,
    student_id: studentId,
    delta,
    reason,
    related_type: relatedType,
    related_id: relatedId,
    note,
    actor_user_id: actorId,
  });
  if (error) throw new Error(`credit ${reason}/${studentId}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function parseTenantIdFromArgv(argv: string[]): string {
  for (const arg of argv) {
    const m = arg.match(/^--tenant-id=(.+)$/);
    if (m) return m[1]!;
  }
  return PRODUCTION_TEST_TENANT_ID;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  TEST_TENANT_ID = parseTenantIdFromArgv(process.argv);
  console.log(`\n${bannerFor(env)} — seeding scenario accounts`);
  console.log(`Tenant: ${TEST_TENANT_ID}\n`);

  const supabase = resolveSupabaseAdminClient(env);

  // Verify tenant exists
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("id", TEST_TENANT_ID)
    .maybeSingle<{ id: string; name: string }>();
  if (tenantErr) throw tenantErr;
  if (!tenant) {
    throw new Error(
      `Test tenant ${TEST_TENANT_ID} not found — run db:seed first or check the tenant_id.`,
    );
  }
  console.log(`✓ Tenant found: ${tenant.name}\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Create all 66 auth users
  // -------------------------------------------------------------------------

  console.log("── Phase 1: Auth users ─────────────────────────────────────");

  const adminIds: string[] = [];
  for (let n = 1; n <= 3; n++) {
    const email = `tenantadmin${n}@nxtdrive.io`;
    const { id, created } = await upsertAuthUser(
      supabase,
      email,
      `tenantadmin${n}`,
      `Schoolbeheerder ${n}`,
    );
    adminIds.push(id);
    console.log(`  ${created ? "✓" : "·"} ${email} (${id})`);
  }

  const instructeurIds: string[] = [];
  const instructeurNames = [
    "Jan de Vries",
    "Marie Smit",
    "Pieter Bakker",
    "Anna Jansen",
    "Tom Willems",
    "Sara Meijer",
    "Kees Peters",
    "Linda Groot",
  ];
  for (let n = 1; n <= 8; n++) {
    const email = `instructeur${n}@nxtdrive.io`;
    const { id, created } = await upsertAuthUser(
      supabase,
      email,
      `instructeur${n}`,
      instructeurNames[n - 1]!,
    );
    instructeurIds.push(id);
    console.log(`  ${created ? "✓" : "·"} ${email} (${id})`);
  }

  const leerlingIds: string[] = [];
  const leerlingNames = [
    "Emma de Boer", "Noah van Dijk", "Olivia Visser", "Liam Meijer",
    "Ava Smeets", "Sem Brouwer", "Sophie Linden", "Daan Hoekstra",
    "Mila Kuipers", "Lars Postma", "Julia Hendriks", "Tim Oosterdam",
    "Fleur Bergman", "Max Veldman", "Nina Scholte", "Stef Groen",
    "Roos Dijkstra", "Finn Mulder", "Lotte Bos", "Ruben Kok",
    "Amber Klein", "Thijs Huisman", "Sanne Boers", "Dylan Pieters",
    "Iris Fontein", "Jesse Vermeer", "Lisa Evers", "Milan Gerrits",
    "Eva Baars", "Bram Harmsen", "Noor Timmerman", "Rick Claessen",
    "Fenna Jacobs", "Jasper Laan", "Vera Westdijk", "Hugo Stam",
    "Charlotte Blom", "Jens Veen", "Maud Teunissen", "Bo Gerritsen",
  ];
  for (let n = 1; n <= 40; n++) {
    const email = `leerling${n}@nxtdrive.io`;
    const { id, created } = await upsertAuthUser(
      supabase,
      email,
      `leerling${n}`,
      leerlingNames[n - 1]!,
    );
    leerlingIds.push(id);
    console.log(`  ${created ? "✓" : "·"} ${email} (${id})`);
  }

  const ouderIds: string[] = [];
  const ouderNames = [
    "Petra de Boer", "Henk van Dijk", "Carla Visser", "Frank Meijer",
    "Irene Smeets", "Paul Brouwer", "Marieke Linden", "Gerard Hoekstra",
    "Tine Kuipers", "Wim Postma", "Ans Hendriks", "Cor Oosterdam",
    "Els Bergman", "Klaas Veldman", "Rita Scholte",
  ];
  for (let n = 1; n <= 15; n++) {
    const email = `ouder${n}@nxtdrive.io`;
    const { id, created } = await upsertAuthUser(
      supabase,
      email,
      `ouder${n}`,
      ouderNames[n - 1]!,
    );
    ouderIds.push(id);
    console.log(`  ${created ? "✓" : "·"} ${email} (${id})`);
  }

  console.log(
    `\n  Total: ${adminIds.length} admins, ${instructeurIds.length} instructeurs, ` +
      `${leerlingIds.length} leerlingen, ${ouderIds.length} ouders\n`,
  );

  // -------------------------------------------------------------------------
  // Phase 2: Profiles + memberships
  // -------------------------------------------------------------------------

  console.log("── Phase 2: Profiles & memberships ─────────────────────────");

  for (let i = 0; i < adminIds.length; i++) {
    const n = i + 1;
    await upsertProfile(
      supabase,
      adminIds[i]!,
      `tenantadmin${n}@nxtdrive.io`,
      `Schoolbeheerder ${n}`,
    );
    await upsertMembership(supabase, adminIds[i]!, "tenant_admin");
  }
  console.log(`  ✓ ${adminIds.length} admin profiles + memberships`);

  for (let i = 0; i < instructeurIds.length; i++) {
    const n = i + 1;
    await upsertProfile(
      supabase,
      instructeurIds[i]!,
      `instructeur${n}@nxtdrive.io`,
      instructeurNames[i]!,
    );
    await upsertMembership(supabase, instructeurIds[i]!, "instructor");
  }
  console.log(`  ✓ ${instructeurIds.length} instructeur profiles + memberships`);

  for (let i = 0; i < leerlingIds.length; i++) {
    const n = i + 1;
    await upsertProfile(
      supabase,
      leerlingIds[i]!,
      `leerling${n}@nxtdrive.io`,
      leerlingNames[i]!,
    );
    await upsertMembership(supabase, leerlingIds[i]!, "student");
  }
  console.log(`  ✓ ${leerlingIds.length} leerling profiles + memberships`);

  for (let i = 0; i < ouderIds.length; i++) {
    const n = i + 1;
    await upsertProfile(
      supabase,
      ouderIds[i]!,
      `ouder${n}@nxtdrive.io`,
      ouderNames[i]!,
    );
    await upsertMembership(supabase, ouderIds[i]!, "parent");
  }
  console.log(`  ✓ ${ouderIds.length} ouder profiles + memberships\n`);

  // actorId needed for lead events and credit entries throughout the script
  const actorId = adminIds[0]!;

  // -------------------------------------------------------------------------
  // Phase 3a: Converted leads — must exist before students (FK constraint)
  // -------------------------------------------------------------------------

  console.log("── Phase 3a: Converted leads (one per active student) ───────");

  let convertedLeadCount = 0;
  for (let i = 0; i < leerlingIds.length; i++) {
    const phase = phaseForStudent(i);
    if (phase === 11) continue; // slapend — no lead

    const cLeadId = studentLeadId(i)!;
    const n = i + 1;
    const name = leerlingNames[i]!;
    const cEmail = `leerling${n}.lead@example.com`;
    const convertedAt = daysAgo(70 + i);

    const { error: cLeadErr } = await supabase.from("leads").upsert(
      {
        id: cLeadId,
        tenant_id: TEST_TENANT_ID,
        status: "converted",
        source: (["website", "instagram", "google", "referral", "facebook"] as const)[i % 5],
        full_name: name,
        email: cEmail,
        phone: `061234${8000 + i}`,
        message: `Aangemeld via de website. Omgezet naar leerling.`,
        created_at: daysAgo(75 + i).toISOString(),
        updated_at: convertedAt.toISOString(),
      },
      { onConflict: "id" },
    );
    if (cLeadErr) throw new Error(`converted lead leerling${n}: ${cLeadErr.message}`);

    await insertLeadEvent(
      supabase,
      nameUuid(`student-lead-${i}-evt-created`),
      cLeadId, "created", { source: "website" }, actorId, daysAgo(75 + i),
    );
    await insertLeadEvent(
      supabase,
      nameUuid(`student-lead-${i}-evt-converted`),
      cLeadId, "status_changed",
      { from: "package_advised", to: "converted", note: "Pakket gekocht, leerling aangemaakt." },
      actorId, convertedAt,
    );

    convertedLeadCount++;
  }
  console.log(`  ✓ ${convertedLeadCount} geconverteerde leads\n`);

  // -------------------------------------------------------------------------
  // Phase 3: Students rows
  // -------------------------------------------------------------------------

  console.log("── Phase 3: Students rows ───────────────────────────────────");

  const studentIds: string[] = [];
  for (let i = 0; i < leerlingIds.length; i++) {
    const n = i + 1;
    const phase = phaseForStudent(i);
    const active = phase !== 11;
    const sid = await upsertStudent(
      supabase,
      leerlingIds[i]!,
      leerlingNames[i]!,
      `leerling${n}@nxtdrive.io`,
      studentLeadId(i), // null for slapend (phase 11)
      active,
    );
    studentIds.push(sid);
  }
  console.log(`  ✓ ${studentIds.length} students\n`);

  // -------------------------------------------------------------------------
  // Phase 4: Guardian links (~14 students, deterministic)
  // -------------------------------------------------------------------------

  console.log("── Phase 4: Guardian links ──────────────────────────────────");

  let guardianCount = 0;
  for (let gi = 0; gi < GUARDIAN_STUDENT_INDICES.length; gi++) {
    const studentIdx = GUARDIAN_STUDENT_INDICES[gi]!;
    const studentId = studentIds[studentIdx]!;
    const ouderUserId = ouderIds[gi]!;
    const { error } = await supabase.from("student_guardians").upsert(
      {
        tenant_id: TEST_TENANT_ID,
        student_id: studentId,
        user_id: ouderUserId,
        relation: "ouder",
      },
      { onConflict: "student_id,user_id" },
    );
    if (error)
      throw new Error(
        `guardian link student[${studentIdx}]/ouder[${gi}]: ${error.message}`,
      );
    guardianCount++;
  }
  console.log(`  ✓ ${guardianCount} ouder-leerling koppelingen\n`);

  // -------------------------------------------------------------------------
  // Phase 5: Seed skill taxonomy for this tenant
  // -------------------------------------------------------------------------

  console.log("── Phase 5: Skill taxonomy ──────────────────────────────────");

  const { error: taxErr } = await supabase.rpc("_insert_default_skill_taxonomy", {
    p_tenant_id: TEST_TENANT_ID,
  });
  if (taxErr)
    throw new Error(`skill taxonomy seed: ${taxErr.message}`);

  const { data: leafSkills, error: leafErr } = await supabase
    .from("skill_taxonomy")
    .select("id, code, label")
    .eq("tenant_id", TEST_TENANT_ID)
    .eq("level", 3)
    .order("sort_order")
    .limit(20);
  if (leafErr) throw leafErr;
  const skills = leafSkills ?? [];
  console.log(`  ✓ Skill taxonomy ready (${skills.length} leaf skills queried)\n`);

  // -------------------------------------------------------------------------
  // Phase 6: Seed package for this tenant
  // -------------------------------------------------------------------------

  console.log("── Phase 6: Seed packages ───────────────────────────────────");

  const pkgBasicId = nameUuid("pkg-basic-1200min");
  const pkgFullId = nameUuid("pkg-full-2400min");

  for (const [pkgId, name, credits, price] of [
    [pkgBasicId, "Basistraject (20u) — seed", 1200, 89900],
    [pkgFullId, "Volledig traject (40u) — seed", 2400, 169900],
  ] as [string, string, number, number][]) {
    const { error } = await supabase.from("packages").upsert(
      {
        id: pkgId,
        tenant_id: TEST_TENANT_ID,
        name,
        credits_total: credits,
        price_cents: price,
        active: true,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`package ${name}: ${error.message}`);
    console.log(`  ✓ Package: ${name}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // Phase 7: Leads (fases 1–4, 19 leads)
  // -------------------------------------------------------------------------

  console.log("── Phase 7: Leads (fases 1–4) ───────────────────────────────");

  const leadDefs = [
    // Fase 1: verse lead (6)
    { key: "lead-01", name: "Kevin Janssen", email: "k.janssen.lead@example.com", phone: "0612345001", status: "new" as const, daysAgoCreated: 3, source: "website" as const },
    { key: "lead-02", name: "Merel Driessen", email: "m.driessen.lead@example.com", phone: "0612345002", status: "new" as const, daysAgoCreated: 5, source: "instagram" as const },
    { key: "lead-03", name: "Joost Verhoef", email: "j.verhoef.lead@example.com", phone: "0612345003", status: "new" as const, daysAgoCreated: 2, source: "google" as const },
    { key: "lead-04", name: "Nienke Brands", email: "n.brands.lead@example.com", phone: "0612345004", status: "new" as const, daysAgoCreated: 7, source: "website" as const },
    { key: "lead-05", name: "Arno Haaksma", email: "a.haaksma.lead@example.com", phone: "0612345005", status: "new" as const, daysAgoCreated: 1, source: "facebook" as const },
    { key: "lead-06", name: "Bianca Oomen", email: "b.oomen.lead@example.com", phone: "0612345006", status: "new" as const, daysAgoCreated: 4, source: "referral" as const },
    // Fase 2: gecontacteerd (5)
    { key: "lead-07", name: "Niels Akkerman", email: "n.akkerman.lead@example.com", phone: "0612345007", status: "contacted" as const, daysAgoCreated: 12, source: "website" as const },
    { key: "lead-08", name: "Wendy Slagter", email: "w.slagter.lead@example.com", phone: "0612345008", status: "contacted" as const, daysAgoCreated: 9, source: "google" as const },
    { key: "lead-09", name: "Rik Lindenburg", email: "r.lindenburg.lead@example.com", phone: "0612345009", status: "contacted" as const, daysAgoCreated: 14, source: "instagram" as const },
    { key: "lead-10", name: "Hilde Kupers", email: "h.kupers.lead@example.com", phone: "0612345010", status: "contacted" as const, daysAgoCreated: 11, source: "website" as const },
    { key: "lead-11", name: "Sven Rozenbroek", email: "s.rozenbroek.lead@example.com", phone: "0612345011", status: "contacted" as const, daysAgoCreated: 8, source: "referral" as const },
    // Fase 3: proefles ingepland (4) — lead status stays 'contacted' + trial scheduled note
    { key: "lead-12", name: "Chantal Wolters", email: "c.wolters.lead@example.com", phone: "0612345012", status: "contacted" as const, daysAgoCreated: 16, source: "website" as const },
    { key: "lead-13", name: "Patrick Struik", email: "p.struik.lead@example.com", phone: "0612345013", status: "contacted" as const, daysAgoCreated: 20, source: "google" as const },
    { key: "lead-14", name: "Hanneke Groenewoud", email: "h.groenewoud.lead@example.com", phone: "0612345014", status: "contacted" as const, daysAgoCreated: 18, source: "facebook" as const },
    { key: "lead-15", name: "Maurice Oldenhuis", email: "m.oldenhuis.lead@example.com", phone: "0612345015", status: "contacted" as const, daysAgoCreated: 22, source: "website" as const },
    // Fase 4: proefles gedaan, package_advised (4)
    { key: "lead-16", name: "Simone Holtslag", email: "s.holtslag.lead@example.com", phone: "0612345016", status: "package_advised" as const, daysAgoCreated: 28, source: "website" as const },
    { key: "lead-17", name: "Erwin Feenstra", email: "e.feenstra.lead@example.com", phone: "0612345017", status: "package_advised" as const, daysAgoCreated: 25, source: "instagram" as const },
    { key: "lead-18", name: "Daphne Wierda", email: "d.wierda.lead@example.com", phone: "0612345018", status: "package_advised" as const, daysAgoCreated: 30, source: "google" as const },
    { key: "lead-19", name: "Gerben Haan", email: "g.haan.lead@example.com", phone: "0612345019", status: "package_advised" as const, daysAgoCreated: 21, source: "referral" as const },
  ] as const;

  let leadsCreated = 0;
  for (const def of leadDefs) {
    const leadId = nameUuid(def.key);
    const createdAt = daysAgo(def.daysAgoCreated);

    const { error: leadErr } = await supabase.from("leads").upsert(
      {
        id: leadId,
        tenant_id: TEST_TENANT_ID,
        status: def.status,
        source: def.source,
        full_name: def.name,
        email: def.email,
        phone: def.phone,
        message: `Ik wil graag rijles volgen. Aangemeld via ${def.source}.`,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      },
      { onConflict: "id" },
    );
    if (leadErr) throw new Error(`lead ${def.key}: ${leadErr.message}`);

    // Lead events — use insertLeadEvent (existence-check + insert) because
    // lead_events is insert-only: a trigger blocks UPDATE so upsert would fail on reruns.
    await insertLeadEvent(
      supabase,
      nameUuid(`${def.key}-evt-created`),
      leadId, "created", { source: def.source }, actorId, createdAt,
    );

    if (def.status === "contacted" || def.status === "package_advised") {
      await insertLeadEvent(
        supabase,
        nameUuid(`${def.key}-evt-contacted`),
        leadId, "contacted", { note: "Telefonisch contact gehad." },
        actorId, daysAgo(def.daysAgoCreated - 2),
      );
    }
    if (def.status === "package_advised") {
      await insertLeadEvent(
        supabase,
        nameUuid(`${def.key}-evt-status-changed`),
        leadId, "status_changed",
        { from: "contacted", to: "package_advised", note: "Proefles gedaan, pakket besproken." },
        actorId, daysAgo(def.daysAgoCreated - 5),
      );
    }
    if (def.key === "lead-12" || def.key === "lead-13" || def.key === "lead-14" || def.key === "lead-15") {
      await insertLeadEvent(
        supabase,
        nameUuid(`${def.key}-evt-trial-scheduled`),
        leadId, "note", { note: "Proefles ingepland." },
        actorId, daysAgo(def.daysAgoCreated - 3),
      );
    }

    leadsCreated++;
    console.log(`  ✓ ${def.name} (${def.status})`);
  }

  // Converted leads (34 active students) were created in Phase 3a before students.
  console.log(`\n  Total: ${leadsCreated} funnel leads + ${convertedLeadCount} converted = ${leadsCreated + convertedLeadCount} leads\n`);

  // -------------------------------------------------------------------------
  // Phase 8: Student lifecycle scenarios (fases 5–11)
  // -------------------------------------------------------------------------

  console.log("── Phase 8: Student scenarios (fases 5–11) ──────────────────");

  let lessonCount = 0;
  let creditCount = 0;
  let invoiceCount = 0;
  let cbrCount = 0;
  let appointmentCount = 0;
  let skillScoreCount = 0;

  for (let i = 0; i < leerlingIds.length; i++) {
    const studentIdx = i;
    const studentId = studentIds[i]!;
    const phase = phaseForStudent(studentIdx);
    const n = i + 1;

    // Determine instructor
    let instructorId = instructeurIds[0]!;
    for (let r = 0; r < INSTRUCTOR_STUDENT_RANGES.length; r++) {
      const [lo, hi] = INSTRUCTOR_STUDENT_RANGES[r]!;
      if (studentIdx >= lo && studentIdx <= hi) {
        instructorId = instructeurIds[r]!;
        break;
      }
    }

    // Fase 11: slapend — no credits/lessons, just a student row
    if (phase === 11) {
      console.log(`  · leerling${n} fase 11 (slapend) — no active data`);
      continue;
    }

    // ── Credits: grant package ──────────────────────────────────────────────
    const pkgId = phase >= 7 ? pkgFullId : pkgBasicId;
    const pkgCredits = phase >= 7 ? 2400 : 1200;

    await insertCredit(
      supabase,
      studentId,
      pkgCredits,
      "package_purchase",
      "package",
      pkgId,
      `Pakket toegekend — seed leerling${n}`,
      actorId,
    );
    creditCount++;

    // ── Lessons ────────────────────────────────────────────────────────────
    const lessonCounts: Record<number, number> = { 5: 2, 6: 8, 7: 12, 8: 14, 9: 16, 10: 14, 11: 0 };
    const numLessons = lessonCounts[phase] ?? 2;

    for (let l = 0; l < numLessons; l++) {
      const lessonId = nameUuid(`lesson-${studentIdx}-${l}`);
      const daysBack = (numLessons - l) * 7 + (studentIdx % 5);
      // Stagger hour by student to avoid instructor overlap for planned lessons
      const hour = 9 + (l % 4) * 2; // 9, 11, 13, 15

      let lessonStatus = "completed";
      let startsAt: Date;
      let endsAt: Date;

      // Phase 7: last lesson is 'planned' (upcoming)
      if (phase === 7 && l === numLessons - 1) {
        lessonStatus = "planned";
        startsAt = daysFromNow(3 + (studentIdx % 7), hour);
        endsAt = addMinutes(startsAt, 60);
      } else {
        startsAt = daysAgo(daysBack, hour);
        endsAt = addMinutes(startsAt, 60);
      }

      const { error: lesErr } = await supabase.from("lessons").upsert(
        {
          id: lessonId,
          tenant_id: TEST_TENANT_ID,
          instructor_id: instructorId,
          student_id: studentId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: lessonStatus,
          credits_cost: 60,
          created_by: actorId,
        },
        { onConflict: "id" },
      );
      if (lesErr)
        throw new Error(`lesson leerling${n}/${l}: ${lesErr.message}`);
      lessonCount++;

      // Deduct credit for each lesson (completed lessons consumed credits)
      if (lessonStatus === "completed") {
        await insertCredit(
          supabase,
          studentId,
          -60,
          "lesson_consumed",
          "lesson",
          lessonId,
          `Les gereden — seed`,
          actorId,
        );
        creditCount++;
      } else {
        // Planned lesson: consume credit now (scheduler does this at booking time)
        await insertCredit(
          supabase,
          studentId,
          -60,
          "lesson_consumed",
          "lesson",
          lessonId,
          `Les ingepland — seed`,
          actorId,
        );
        creditCount++;
      }

      // ── Skill scores for fase 6+ (mid-training) ────────────────────────
      if (phase >= 6 && l >= 2 && skills.length >= 3) {
        // Score 3 skills per lesson (rotating)
        for (let sk = 0; sk < 3; sk++) {
          const skill = skills[(l * 3 + sk) % skills.length]!;
          const score = Math.min(10, Math.max(1, 3 + l + sk));

          const { error: ssErr } = await supabase
            .from("lesson_skill_scores")
            .upsert(
              {
                lesson_id: lessonId,
                tenant_id: TEST_TENANT_ID,
                student_id: studentId,
                skill_id: skill.id,
                score,
                scored_by: instructorId,
              },
              { onConflict: "lesson_id,skill_id" },
            );
          if (ssErr && !ssErr.message.includes("violates"))
            throw new Error(`skill score: ${ssErr.message}`);
          skillScoreCount++;

          // Rollup: student_skill_scores — latest score
          await supabase.from("student_skill_scores").upsert(
            {
              student_id: studentId,
              tenant_id: TEST_TENANT_ID,
              skill_id: skill.id,
              score,
              last_lesson_id: lessonId,
              scored_at: startsAt.toISOString(),
              scored_by: instructorId,
            },
            { onConflict: "student_id,skill_id" },
          );
        }
      }
    }

    // ── CBR status for fases 7-10 ──────────────────────────────────────────
    if (phase >= 7) {
      const theorie = phase >= 7;
      const machtigingStatus =
        phase === 7 ? "aangevraagd" :
        phase >= 8  ? "ontvangen"  : "nog_nodig";

      const { error: cbrErr } = await supabase.from("student_cbr_status").upsert(
        {
          student_id: studentId,
          tenant_id: TEST_TENANT_ID,
          theorie_behaald: theorie,
          machtiging_status: machtigingStatus,
          machtiging_geregeld: machtigingStatus === "ontvangen",
          gezondheidsverklaring_vereist: phase >= 9,
          gezondheidsverklaring_geregeld: phase >= 9,
          updated_by: actorId,
        },
        { onConflict: "student_id" },
      );
      if (cbrErr) throw new Error(`cbr status leerling${n}: ${cbrErr.message}`);
      cbrCount++;
    }

    // ── Exam appointment for fases 8-10 ───────────────────────────────────
    if (phase >= 8) {
      const apptId = nameUuid(`exam-appt-${studentIdx}`);
      const daysOffset = phase === 8
        ? 14 + (studentIdx % 10) * 2    // future: staggered
        : (studentIdx % 4 + 1) * 7;     // past: 1-4 weeks ago

      let apptStatus = phase === 8 ? "planned" : "completed";
      const apptStart = phase === 8
        ? daysFromNow(daysOffset, 9)
        : daysAgo(daysOffset, 9);
      const apptEnd = addMinutes(apptStart, 120);

      // Result for fase 9 (passed) and fase 10 (failed)
      const apptResult = phase === 9 ? "passed" : phase === 10 ? "failed" : null;

      const { error: apptErr } = await supabase
        .from("agenda_appointments")
        .upsert(
          {
            id: apptId,
            tenant_id: TEST_TENANT_ID,
            instructor_id: instructorId,
            student_id: studentId,
            type: "exam",
            status: apptStatus,
            starts_at: apptStart.toISOString(),
            ends_at: apptEnd.toISOString(),
            title: "CBR Praktijkexamen",
            result: apptResult,
            result_note:
              phase === 9 ? "Geslaagd! Gefeliciteerd." :
              phase === 10 ? "Helaas niet geslaagd. Herexamen aangevraagd." : null,
            result_recorded_at:
              apptResult ? daysAgo(daysOffset - 1).toISOString() : null,
            result_recorded_by: apptResult ? actorId : null,
            created_by: actorId,
          },
          { onConflict: "id" },
        );
      if (apptErr)
        throw new Error(`exam appt leerling${n}: ${apptErr.message}`);
      appointmentCount++;
    }

    // ── Invoice for converted students (fases 5-10) ────────────────────────
    const invoiceId = nameUuid(`invoice-${studentIdx}`);
    const invoiceNo = 1000 + studentIdx;
    const pkgPrice = phase >= 7 ? 169900 : 89900;

    const { error: invErr } = await supabase.from("invoices").upsert(
      {
        id: invoiceId,
        tenant_id: TEST_TENANT_ID,
        student_id: studentId,
        invoice_no: invoiceNo,
        status: "paid",
        issued_at: daysAgo(60 + studentIdx).toISOString(),
        due_date: isoDate(daysAgo(50 + studentIdx)),
        paid_at: daysAgo(49 + studentIdx).toISOString(),
        subtotal_cents: Math.round(pkgPrice / 1.21),
        tax_cents: Math.round(pkgPrice - pkgPrice / 1.21),
        total_cents: pkgPrice,
        notes: "Pakket betaald — seed data",
        created_by: actorId,
      },
      { onConflict: "id" },
    );
    if (invErr && !invErr.message.includes("unique"))
      throw new Error(`invoice leerling${n}: ${invErr.message}`);

    if (!invErr) {
      const lineId = nameUuid(`invoice-line-${studentIdx}`);
      await supabase.from("invoice_lines").upsert(
        {
          id: lineId,
          invoice_id: invoiceId,
          tenant_id: TEST_TENANT_ID,
          description: phase >= 7 ? "Volledig traject (40u)" : "Basistraject (20u)",
          quantity: 1,
          unit_price_cents: Math.round(pkgPrice / 1.21),
          tax_rate_bp: 2100,
          amount_cents: Math.round(pkgPrice / 1.21),
          tax_amount_cents: Math.round(pkgPrice - pkgPrice / 1.21),
          related_package_id: pkgId,
          position: 0,
        },
        { onConflict: "id" },
      );
      invoiceCount++;
    }

    console.log(
      `  ✓ leerling${n} fase ${phase}: ${numLessons} lessen, ` +
        `${phase >= 7 ? "CBR status, " : ""}` +
        `${phase >= 8 ? "examen afspraak, " : ""}` +
        `factuur #${invoiceNo}`,
    );
  }

  // Update invoice_counters to ensure counter is beyond seed invoice numbers
  await supabase.from("invoice_counters").upsert(
    { tenant_id: TEST_TENANT_ID, next_no: 2000 },
    { onConflict: "tenant_id" },
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  const totalUsers = adminIds.length + instructeurIds.length + leerlingIds.length + ouderIds.length;

  console.log(`
✓ Seed complete:
  ${totalUsers} users (${adminIds.length} admins, ${instructeurIds.length} instructeurs, ${leerlingIds.length} leerlingen, ${ouderIds.length} ouders)
  ${studentIds.length} students rows
  ${guardianCount} ouder-leerling koppelingen
  ${leadsCreated} leads (fases 1–4)
  ${lessonCount} lessons
  ${creditCount} credit_ledger entries
  ${cbrCount} CBR status rows
  ${appointmentCount} exam appointments
  ${skillScoreCount} skill score entries
  ${invoiceCount} invoices
  Tenant: ${tenant.name} (${TEST_TENANT_ID})
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
