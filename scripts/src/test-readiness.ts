/**
 * Leskaart L1 — Examenrijpheid tests.
 *
 *   pnpm --filter @workspace/scripts run db:test-readiness
 *   pnpm --filter @workspace/scripts run db:test-readiness -- --env=production
 *
 * Part A — pure engine (computeReadiness), deterministic, no DB:
 *   advice bands, conservative gap-closing, critical-skill gate, stability,
 *   preconditions, 0..100 mapping + phase bands, blockers.
 *
 * Part B — student_cbr_status RLS + RPC (against the DB):
 *   1. anon cannot read student_cbr_status.
 *   2. set_student_cbr_status via service upserts a row + writes audit.
 *   3. a tenant member can read own-tenant status; a member of another tenant
 *      cannot (cross-tenant isolation).
 *   4. set_student_cbr_status rejects a cross-tenant actor.
 *   5. anon cannot call set_student_cbr_status (execute revoked).
 */
import { createClient } from "@supabase/supabase-js";
import {
  computeReadiness,
  type ReadinessInput,
  type ReadinessPreconditions,
} from "@workspace/leskaart";
import { bannerFor, parseEnvFromArgv } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

const PRECO_ALL: ReadinessPreconditions = {
  theorieBehaald: true,
  machtigingGeregeld: true,
  gezondheidsverklaringVereist: true,
  gezondheidsverklaringGeregeld: true,
};
const PRECO_NONE: ReadinessPreconditions = {
  theorieBehaald: false,
  machtigingGeregeld: false,
  gezondheidsverklaringVereist: true,
  gezondheidsverklaringGeregeld: false,
};

function lesson(id: string, day: string, scores: number[]) {
  return { lessonId: id, startsAt: `2026-05-${day}T10:00:00Z`, scores };
}
const STABLE_9 = [
  lesson("l1", "01", [9, 9]),
  lesson("l2", "02", [9, 9]),
  lesson("l3", "03", [9, 9]),
];
const STABLE_10 = [
  lesson("l1", "01", [10, 10]),
  lesson("l2", "02", [10, 10]),
  lesson("l3", "03", [10, 10]),
];

type Skill = { isCritical: boolean; score: number | null };
function skills(list: Skill[]) {
  return list.map((s, i) => ({ skillId: `s${i}`, ...s }));
}
function run(input: ReadinessInput) {
  return computeReadiness(input);
}

function engineTests(): Outcome[] {
  const r: Outcome[] = [];
  const assert = (name: string, ok: boolean, detail?: string) =>
    r.push({ name, ok, detail });

  // 1. Empty curriculum.
  {
    const res = run({ skills: [], lessons: [], preconditions: PRECO_ALL });
    assert(
      "empty curriculum => niet, 0%, beginfase",
      res.advice === "niet_examenrijp" &&
        res.readinessPct === 0 &&
        res.phase === "beginfase",
      `advice=${res.advice} pct=${res.readinessPct} phase=${res.phase}`,
    );
  }

  // 2. All unscored => average 1, 0%, niet.
  {
    const res = run({
      skills: skills([
        { isCritical: true, score: null },
        { isCritical: false, score: null },
      ]),
      lessons: [],
      preconditions: PRECO_ALL,
    });
    assert(
      "all unscored => avg 1, 0%, niet",
      res.averageScore === 1 &&
        res.readinessPct === 0 &&
        res.advice === "niet_examenrijp",
      `avg=${res.averageScore} pct=${res.readinessPct} advice=${res.advice}`,
    );
  }

  // 3. All 10s + preconditions + stable => examenwaardig, 100%, phase examenwaardig.
  {
    const res = run({
      skills: skills([
        { isCritical: true, score: 10 },
        { isCritical: true, score: 10 },
        { isCritical: false, score: 10 },
      ]),
      lessons: STABLE_10,
      preconditions: PRECO_ALL,
    });
    assert(
      "all 10 + preco + stable => examenwaardig, 100%, phase examenwaardig",
      res.advice === "examenwaardig" &&
        res.readinessPct === 100 &&
        res.phase === "examenwaardig" &&
        res.blockers.length === 0,
      `advice=${res.advice} pct=${res.readinessPct} phase=${res.phase} blockers=${res.blockers.length}`,
    );
  }

  // 4. avg>=8, crit>=8, stable but theorie missing => bijna (not examenwaardig).
  {
    const res = run({
      skills: skills([
        { isCritical: true, score: 9 },
        { isCritical: true, score: 9 },
        { isCritical: false, score: 8 },
        { isCritical: false, score: 8 },
      ]),
      lessons: STABLE_9,
      preconditions: { ...PRECO_ALL, theorieBehaald: false },
    });
    assert(
      "qualifies but theorie missing => bijna + theorie blocker",
      res.advice === "bijna_examenrijp" &&
        res.blockers.some((b) => b.toLowerCase().includes("theorie")),
      `advice=${res.advice} blockers=${JSON.stringify(res.blockers)}`,
    );
  }

  // 5. Critical skill at 7 (below 8) but high average => conservative niet.
  {
    const res = run({
      skills: skills([
        { isCritical: true, score: 7 },
        { isCritical: false, score: 9 },
        { isCritical: false, score: 9 },
      ]),
      lessons: STABLE_9,
      preconditions: PRECO_ALL,
    });
    assert(
      "critical 7 (between niet/bijna gap) => conservative niet",
      res.advice === "niet_examenrijp" && res.criticalMinScore === 7,
      `advice=${res.advice} critMin=${res.criticalMinScore}`,
    );
  }

  // 6. Critical below 7 => niet.
  {
    const res = run({
      skills: skills([
        { isCritical: true, score: 5 },
        { isCritical: false, score: 9 },
      ]),
      lessons: STABLE_9,
      preconditions: PRECO_ALL,
    });
    assert(
      "critical < 7 => niet",
      res.advice === "niet_examenrijp",
      `advice=${res.advice}`,
    );
  }

  // 7. avg 7.5, crit>=8, not stable (only 2 lessons) => bijna.
  {
    const res = run({
      skills: skills([
        { isCritical: true, score: 8 },
        { isCritical: false, score: 7 },
      ]),
      lessons: [lesson("l1", "01", [8, 7]), lesson("l2", "02", [8, 7])],
      preconditions: PRECO_ALL,
    });
    assert(
      "avg 7.5, crit 8, only 2 lessons => bijna + not stable",
      res.advice === "bijna_examenrijp" &&
        res.averageScore === 7.5 &&
        res.stability.stable === false,
      `advice=${res.advice} avg=${res.averageScore} stable=${res.stability.stable}`,
    );
  }

  // 8. Readiness mapping + phase bands.
  {
    // avg 5.5 => round((4.5/9)*100)=50 => ontwikkelfase
    const res = run({
      skills: skills([
        { isCritical: false, score: 5 },
        { isCritical: false, score: 6 },
      ]),
      lessons: [],
      preconditions: PRECO_NONE,
    });
    assert(
      "avg 5.5 => 50% ontwikkelfase",
      res.readinessPct === 50 && res.phase === "ontwikkelfase",
      `pct=${res.readinessPct} phase=${res.phase}`,
    );
  }
  {
    // avg 7 => round((6/9)*100)=67 => gevorderd
    const res = run({
      skills: skills([{ isCritical: false, score: 7 }]),
      lessons: [],
      preconditions: PRECO_NONE,
    });
    assert(
      "avg 7 => 67% gevorderd",
      res.readinessPct === 67 && res.phase === "gevorderd",
      `pct=${res.readinessPct} phase=${res.phase}`,
    );
  }

  // 9. Stability: spread > 1 => not stable.
  {
    const res = run({
      skills: skills([{ isCritical: true, score: 9 }]),
      lessons: [
        lesson("l1", "01", [7]),
        lesson("l2", "02", [9]),
        lesson("l3", "03", [9]),
      ],
      preconditions: PRECO_ALL,
    });
    assert(
      "last-3 spread > 1 => not stable",
      res.stability.stable === false,
      `averages=${JSON.stringify(res.stability.lessonAverages)}`,
    );
  }

  // 10. Disclaimer always present.
  {
    const res = run({ skills: [], lessons: [], preconditions: PRECO_ALL });
    assert(
      "disclaimer present",
      res.disclaimer.length > 0 && /adviserend/i.test(res.disclaimer),
    );
  }

  return r;
}

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — Leskaart L1 readiness tests`);

  const results: Outcome[] = engineTests();

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const password = `r-pass-${stamp}`;
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  try {
    async function createTenant(slug: string, name: string): Promise<string> {
      const { data, error } = await serviceClient
        .from("tenants")
        .insert({ slug, name })
        .select("id")
        .single();
      if (error || !data) throw new Error(`create tenant ${slug}: ${error?.message}`);
      createdTenantIds.push(data.id as string);
      return data.id as string;
    }
    async function createMember(tid: string, email: string) {
      const { data: u, error } = await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
      });
      if (error || !u?.user) throw new Error(`createUser: ${error?.message}`);
      const userId = u.user.id;
      createdUserIds.push(userId);
      await serviceClient
        .from("profiles")
        .upsert({ id: userId, email, full_name: "Readiness Tester" });
      await serviceClient
        .from("memberships")
        .insert({ user_id: userId, tenant_id: tid, role: "tenant_admin" });
      const client = createClient(url!, anon!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error || !signIn.data.session) {
        throw new Error(`signIn: ${signIn.error?.message}`);
      }
      return { client, userId };
    }
    async function createStudent(tid: string, name: string): Promise<string> {
      const { data, error } = await serviceClient
        .from("students")
        .insert({ tenant_id: tid, full_name: name })
        .select("id")
        .single();
      if (error || !data) throw new Error(`create student: ${error?.message}`);
      return data.id as string;
    }

    const tenantId = await createTenant(`readiness-${stamp}`, `Readiness ${stamp}`);
    const member = await createMember(tenantId, `r-demo-${stamp}@nxtdrive.test`);
    const studentId = await createStudent(tenantId, "Readiness Student");

    const otherTenantId = await createTenant(
      `readiness-other-${stamp}`,
      `Readiness Other ${stamp}`,
    );
    const otherMember = await createMember(
      otherTenantId,
      `r-other-${stamp}@nxtdrive.test`,
    );

    // 1. anon cannot read student_cbr_status (before any row exists too).
    {
      const { data } = await anonClient
        .from("student_cbr_status")
        .select("*")
        .limit(5);
      results.push({
        name: "anon cannot read student_cbr_status",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // 2. set_student_cbr_status upserts + writes audit.
    {
      const { error } = await serviceClient.rpc("set_student_cbr_status", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: member.userId,
        p_theorie_behaald: true,
        p_machtiging_geregeld: true,
        p_gezondheidsverklaring_vereist: true,
        p_gezondheidsverklaring_geregeld: false,
      });
      const { data: row } = await serviceClient
        .from("student_cbr_status")
        .select("theorie_behaald, machtiging_geregeld, gezondheidsverklaring_geregeld")
        .eq("student_id", studentId)
        .maybeSingle();
      const { data: audit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "cbr.status_set")
        .eq("target_id", studentId);
      results.push({
        name: "set_student_cbr_status upserts row + writes audit",
        ok:
          !error &&
          row?.theorie_behaald === true &&
          row?.machtiging_geregeld === true &&
          row?.gezondheidsverklaring_geregeld === false &&
          (audit ?? []).length === 1,
        detail: error
          ? error.message
          : `row=${JSON.stringify(row)} audit=${(audit ?? []).length}`,
      });
    }

    // 3a. own-tenant member can read the status.
    {
      const { data } = await member.client
        .from("student_cbr_status")
        .select("student_id")
        .eq("student_id", studentId);
      results.push({
        name: "tenant member reads own-tenant status",
        ok: (data ?? []).length === 1,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    // 3b. member of another tenant cannot read it.
    {
      const { data } = await otherMember.client
        .from("student_cbr_status")
        .select("student_id")
        .eq("student_id", studentId);
      results.push({
        name: "cross-tenant member cannot read status",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // 4. cross-tenant actor rejected by RPC.
    {
      const { error } = await serviceClient.rpc("set_student_cbr_status", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: otherMember.userId,
        p_theorie_behaald: true,
        p_machtiging_geregeld: true,
        p_gezondheidsverklaring_vereist: true,
        p_gezondheidsverklaring_geregeld: true,
      });
      results.push({
        name: "set_student_cbr_status rejects cross-tenant actor",
        ok: !!error,
        detail: error ? error.message : "no error (unexpected)",
      });
    }

    // 5. anon cannot call the RPC (execute revoked).
    {
      const { error } = await anonClient.rpc("set_student_cbr_status", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: member.userId,
        p_theorie_behaald: true,
        p_machtiging_geregeld: true,
        p_gezondheidsverklaring_vereist: true,
        p_gezondheidsverklaring_geregeld: true,
      });
      results.push({
        name: "anon cannot call set_student_cbr_status",
        ok: !!error,
        detail: error ? error.message : "no error (unexpected)",
      });
    }
  } finally {
    for (const tid of createdTenantIds) {
      await serviceClient.from("tenants").delete().eq("id", tid);
    }
    for (const uid of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(uid);
    }
  }

  // Report.
  let failed = 0;
  for (const o of results) {
    const tag = o.ok ? "✅" : "❌";
    if (!o.ok) failed++;
    console.log(`${tag} ${o.name}${o.detail ? ` — ${o.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
