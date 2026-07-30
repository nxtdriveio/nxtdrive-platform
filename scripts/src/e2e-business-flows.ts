/**
 * Browser-driven business-flow E2E suite for staging / production-like targets.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run e2e:business-flows
 *   pnpm --filter @workspace/scripts run e2e:business-flows -- --env=production
 *
 * Environment:
 *   E2E_BASE_URL                 Optional app origin. Defaults per env:
 *                                staging    -> https://staging.nxtdrive.io
 *                                production -> https://nxtdrive.io
 *   E2E_TIMEOUT_MS              Optional per-step timeout in ms (default 20000)
 *   E2E_HEADLESS                "0" for headed, default headless
 *   E2E_TENANT_ID               Override test tenant id
 *   E2E_ADMIN_EMAIL / PASSWORD
 *   E2E_INSTRUCTOR_EMAIL / PASSWORD
 *   E2E_STUDENT_EMAIL / PASSWORD
 *   E2E_TENANT_HOST             Optional white-label host, e.g. test.nxtdrive.io
 *   E2E_CUSTOM_DOMAIN_HOST      Optional verified custom domain host
 *   E2E_ENABLE_PAYMENT_REDIRECT Optional "1" to click through to PSP redirect
 *
 * Required secrets:
 *   staging    -> SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   production -> PRODUCTION_SUPABASE_URL + PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Ris20ReadinessEvidenceAdapter,
  computeRisModuleReadiness,
  evaluateReadiness,
  type ReadinessPolicy,
  type RisScriptObservation,
} from "@workspace/leskaart";
import { fileURLToPath } from "node:url";
import {
  bannerFor,
  parseEnvFromArgv,
  resolveSupabaseAdminClient,
  type DbEnv,
} from "./lib/db-env.js";
import {
  RisJourneyBot,
  loadRisJourneyBaseline,
  type RisJourneyEvidence,
} from "./lib/ris-journey-bot.js";

type SuiteStatus = "OK" | "SKIP" | "FAIL";
type Result = { status: SuiteStatus; name: string; detail?: string };
type TenantRow = { id: string; slug: string; name: string };
type Account = {
  label: "tenant admin" | "instructor" | "student";
  email: string;
  password: string;
  expectedPath: string;
};
type BranchFixture = {
  branchAId: string;
  branchBId: string;
  branchManagerUserId: string;
  branchManagerMembershipId: string;
  branchManagerEmail: string;
  branchManagerPassword: string;
  studentAId: string;
  studentBId: string;
  studentAName: string;
  studentBName: string;
};
type AuthCookieState = {
  cookies: Array<{
    name: string;
    expires: number;
  }>;
};

const env = parseEnvFromArgv(process.argv);
const baseUrl = normalizeBaseUrl(
  process.env["E2E_BASE_URL"] ??
    (env === "production"
      ? "https://nxtdrive.io"
      : "https://staging.nxtdrive.io"),
);
const timeoutMs = Number(process.env["E2E_TIMEOUT_MS"] ?? "20000");
const headless = process.env["E2E_HEADLESS"] !== "0";
const requestedTenantId = process.env["E2E_TENANT_ID"]?.trim() || null;
const allowPaymentRedirect = process.env["E2E_ENABLE_PAYMENT_REDIRECT"] === "1";
const risJourneyOnly = process.argv.includes("--ris-journey-only");
const enableRisJourney =
  process.env["E2E_ENABLE_RIS_JOURNEY"] === "1" || risJourneyOnly;
const risBaselinePath = fileURLToPath(
  new URL("../ris-journey-baseline.json", import.meta.url),
);
const risOutputDirectory = fileURLToPath(
  new URL("../../test-results/ris-journey/", import.meta.url),
);

const accounts: Account[] = [
  {
    label: "tenant admin",
    email: process.env["E2E_ADMIN_EMAIL"]?.trim() || "tenantadmin1@nxtdrive.io",
    password: process.env["E2E_ADMIN_PASSWORD"]?.trim() || "tenantadmin1",
    expectedPath: "/backoffice",
  },
  {
    label: "instructor",
    email:
      process.env["E2E_INSTRUCTOR_EMAIL"]?.trim() || "instructeur1@nxtdrive.io",
    password: process.env["E2E_INSTRUCTOR_PASSWORD"]?.trim() || "instructeur1",
    expectedPath: "/instructeur",
  },
  {
    label: "student",
    email: process.env["E2E_STUDENT_EMAIL"]?.trim() || "leerling1@nxtdrive.io",
    password: process.env["E2E_STUDENT_PASSWORD"]?.trim() || "leerling1",
    expectedPath: "/leerling",
  },
];

const service = resolveSupabaseAdminClient(env);
const results: Result[] = [];
let failures = 0;
let risJourneyBot: RisJourneyBot | null = null;
let risJourneyReportWritten = false;

const createdLeadIds: string[] = [];
const createdStudentIds: string[] = [];
const createdBranchIds: string[] = [];
const createdMembershipIds: string[] = [];
const createdUserIds: string[] = [];
const createdInvoiceIds: string[] = [];
const createdLessonIds: string[] = [];
const createdConversationIds: string[] = [];
const createdMessageIds: string[] = [];
const risProgressSnapshots: Array<{
  tenantId: string;
  studentId: string;
  scriptId: string;
  row: Record<string, unknown> | null;
}> = [];

function assertPersistentSessionCookies(
  account: Account,
  storage: AuthCookieState,
): string {
  const sessionCookies = storage.cookies.filter(
    (cookie) =>
      cookie.name.includes("sb-") && cookie.name.includes("auth-token"),
  );

  if (sessionCookies.length === 0) {
    throw new Error(`no supabase auth cookies found for ${account.label}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const minRetentionSeconds = 60 * 60 * 24 * 30;
  const expirySeconds = sessionCookies
    .map((cookie) => cookie.expires)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (expirySeconds.length === 0) {
    throw new Error(`session cookies for ${account.label} are not persistent`);
  }

  const earliestExpiry = Math.min(...expirySeconds);
  const retentionDays = Math.floor((earliestExpiry - now) / (60 * 60 * 24));

  if (earliestExpiry - now < minRetentionSeconds) {
    throw new Error(
      `session cookies for ${account.label} expire too soon (${Math.max(retentionDays, 0)} days)`,
    );
  }

  return `${retentionDays} days`;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function record(status: SuiteStatus, name: string, detail?: string): void {
  results.push({ status, name, detail });
  if (status === "FAIL") failures++;
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
}

function appUrl(path: string): string {
  return `${baseUrl}${path}`;
}

function evidence(
  kind: RisJourneyEvidence["kind"],
  source: string,
  summary: string,
): RisJourneyEvidence {
  return { kind, source, summary };
}

async function exactExpertApproval(
  targetType: "CURRICULUM" | "READINESS_POLICY" | "ASSESSMENT_DEFINITION",
  targetId: string,
  contentHash: string,
  validationRecordId: string | null,
): Promise<{ matches: boolean; observed: string }> {
  if (!validationRecordId) {
    return {
      matches: false,
      observed: "Geen expertvalidatierecord gekoppeld.",
    };
  }
  const validation = await service
    .from("expert_validation_records")
    .select(
      "status, target_type, target_id, content_hash, reviewer_user_id, reviewer_credentials, signed_at, scenario_results",
    )
    .eq("id", validationRecordId)
    .maybeSingle();
  if (validation.error || !validation.data) {
    return {
      matches: false,
      observed: validation.error
        ? `Expertvalidatie kon niet worden gelezen: ${validation.error.message}`
        : "Gekoppelde expertvalidatie ontbreekt.",
    };
  }
  const scenarios = Array.isArray(validation.data.scenario_results)
    ? validation.data.scenario_results
    : [];
  const matches =
    validation.data.status === "APPROVED" &&
    validation.data.target_type === targetType &&
    validation.data.target_id === targetId &&
    validation.data.content_hash === contentHash &&
    Boolean(validation.data.reviewer_user_id) &&
    Boolean(String(validation.data.reviewer_credentials ?? "").trim()) &&
    Boolean(validation.data.signed_at) &&
    scenarios.length > 0;
  return {
    matches,
    observed: `Expertstatus=${String(validation.data.status)}; doel en content-hash exact=${validation.data.target_type === targetType && validation.data.target_id === targetId && validation.data.content_hash === contentHash ? "ja" : "nee"}; ondertekening en scenario's compleet=${Boolean(validation.data.signed_at) && scenarios.length > 0 ? "ja" : "nee"}.`,
  };
}

function verifyReadinessInvariants(bot: RisJourneyBot): void {
  const startedAt = Date.now();
  const observedAt = "2026-01-01T10:00:00.000Z";
  const observation = (
    overrides: Partial<RisScriptObservation>,
  ): RisScriptObservation => ({
    id: "journey-evidence",
    scriptId: "journey-script",
    competencyId: "safety-critical",
    observedAt,
    instructionStage: 8,
    performanceOutcome: "DEVELOPING",
    supportLevel: "OBSERVATION_ONLY",
    safetyStatus: "NO_BLOCKER",
    contextTags: ["urban"],
    instructorId: "journey-instructor",
    lessonId: "journey-lesson",
    ...overrides,
  });
  const adapter = new Ris20ReadinessEvidenceAdapter();
  const notObserved = adapter.normalize([
    observation({
      id: "journey-not-observed",
      instructionStage: null,
      performanceOutcome: "NOT_OBSERVED",
      safetyStatus: "NOT_ASSESSED",
    }),
  ]);
  const stageEight = adapter.normalize([
    observation({ id: "journey-stage-eight" }),
  ]);
  const policy: ReadinessPolicy = {
    id: "journey-policy",
    version: "1",
    curriculumVersionId: "journey-curriculum",
    engineVersion: "2",
    status: "PUBLISHED",
    competencyRules: [
      {
        competencyId: "safety-critical",
        critical: true,
        requiredCompetenceBand: "SUFFICIENT",
        requiredIndependenceBand: "INDEPENDENT",
        minimumEvidenceCount: 1,
        minimumContextCount: 1,
        stabilityWindow: 1,
        minimumStableObservations: 1,
        requireSafetyClear: true,
        compensable: false,
      },
    ],
    prerequisiteRules: [],
    assessmentRules: [],
    expertValidation: {
      required: true,
      status: "APPROVED",
      validationRecordId: "journey-validation",
      validatedContentHash: "journey-hash",
      currentContentHash: "journey-hash",
    },
  };
  const stageEvaluation = evaluateReadiness({
    evaluationId: "journey-evaluation",
    tenantId: "journey-tenant",
    enrollmentId: "journey-enrollment",
    trainingMethod: "RIS_2_0",
    curriculumVersionId: "journey-curriculum",
    evaluatedAt: observedAt,
    requestedMode: "ACTIVE",
    policy,
    evidence: stageEight,
    prerequisites: [],
    assessments: [],
  });
  const safetyBlockedModule = computeRisModuleReadiness(1, [
    {
      scriptId: "journey-script",
      moduleNumber: 1,
      step: "8",
      isCritical: true,
      performanceOutcome: "STABLE",
      supportLevel: "OBSERVATION_ONLY",
      safetyStatus: "BLOCKER",
      readyForModuleTest: true,
    },
  ]);
  const nIsCoverageOnly =
    notObserved[0]?.observed === false &&
    notObserved[0]?.competenceBand === "UNKNOWN";
  const stageIsNotMastery =
    stageEight[0]?.competenceBand === "DEVELOPING" &&
    stageEvaluation.status === "BLOCKED" &&
    stageEvaluation.reasons.some(
      (reason) => reason.code === "CRITICAL_COMPETENCE_BELOW_POLICY",
    );
  const safetyCannotBeOverridden =
    safetyBlockedModule.ready === false &&
    safetyBlockedModule.averageStep === null &&
    safetyBlockedModule.blockers.some((blocker) =>
      blocker.toLowerCase().includes("veiligheid"),
    );
  bot.verify("RIS.PREFLIGHT.READINESS_INVARIANTS", {
    passed: nIsCoverageOnly && stageIsNotMastery && safetyCannotBeOverridden,
    observed: `N is uitsluitend ontbrekende dekking=${nIsCoverageOnly ? "ja" : "nee"}; stap 8 met developing blijft blocked=${stageIsNotMastery ? "ja" : "nee"}; handmatige ready-status passeert veiligheidsblokkade niet=${safetyCannotBeOverridden ? "ja" : "nee"}.`,
    evidence: [
      evidence(
        "calculation",
        "@workspace/leskaart centrale readiness-engine",
        "Drie contrafeitelijke scenario's zijn tegen dezelfde engine uitgevoerd die de applicatie gebruikt.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });
}

function plusDaysIso(
  daysAhead: number,
  hourUtc: number,
  minuteUtc = 0,
): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  date.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return date.toISOString();
}

async function ignoreQuery<T>(query: PromiseLike<T>): Promise<void> {
  try {
    await query;
  } catch {
    // Best-effort cleanup only.
  }
}

async function expect<T>(
  name: string,
  fn: () => Promise<T>,
  detailFor?: (value: T) => string | undefined,
): Promise<T | null> {
  try {
    const value = await fn();
    record("OK", name, detailFor?.(value));
    return value;
  } catch (error) {
    record(
      "FAIL",
      name,
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

async function lookupTenant(): Promise<TenantRow> {
  let tenantId = requestedTenantId;
  if (!tenantId) {
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id")
      .eq("email", accounts[0].email.toLowerCase())
      .maybeSingle();
    if (profileError || !profile?.id) {
      throw new Error(
        "E2E_TENANT_ID is unset and the tenant-admin account could not be resolved",
      );
    }
    const { data: membership, error: membershipError } = await service
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", profile.id)
      .eq("role", "tenant_admin")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership?.tenant_id) {
      throw new Error(
        "E2E_TENANT_ID is unset and the tenant-admin account has no tenant membership",
      );
    }
    tenantId = membership.tenant_id as string;
  }

  const { data, error } = await service
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `tenant lookup failed: ${error?.message ?? `tenant ${tenantId} not found`}`,
    );
  }
  return data as TenantRow;
}

async function lookupUserIdByEmail(email: string): Promise<string> {
  const { data, error } = await service
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error(
      `profile lookup failed for ${email}: ${error?.message ?? "not found"}`,
    );
  }
  return data.id as string;
}

async function lookupStudentByUserEmail(
  tenant: TenantRow,
  email: string,
): Promise<{ id: string; full_name: string }> {
  const userId = await lookupUserIdByEmail(email);
  const { data, error } = await service
    .from("students")
    .select("id, full_name")
    .eq("tenant_id", tenant.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error(
      `student lookup failed for ${email}: ${error?.message ?? "not found"}`,
    );
  }
  return { id: data.id as string, full_name: data.full_name as string };
}

async function createBrowser(): Promise<Browser> {
  return chromium.launch({ headless });
}

async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  return page;
}

async function loginViaUi(
  page: Page,
  account: Account,
  loginUrl = appUrl("/login"),
): Promise<void> {
  await page.goto(loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page
    .locator('input[name="email"], input[type="email"]')
    .first()
    .fill(account.email);
  await page
    .locator('input[name="password"], input[type="password"]')
    .first()
    .fill(account.password);
  await page
    .getByRole("button", { name: /inloggen/i })
    .first()
    .click();
  await page.waitForURL(
    (currentUrl) => currentUrl.pathname.startsWith(account.expectedPath),
    {
      timeout: timeoutMs,
    },
  );
}

async function verifyRoleLogin(
  browser: Browser,
  account: Account,
): Promise<void> {
  const context = await browser.newContext();
  const page = await createPage(context);
  try {
    await loginViaUi(page, account);
    const landingUrl = new URL(page.url());
    const storage = await context.storageState();
    const retention = assertPersistentSessionCookies(account, storage);
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (!new URL(page.url()).pathname.startsWith(account.expectedPath)) {
      throw new Error(`reload redirected to ${page.url()}`);
    }
    record("OK", `${account.label} session retention`, retention);

    const restored = await browser.newContext({ storageState: storage });
    const restoredPage = await createPage(restored);
    try {
      await restoredPage.goto(`${landingUrl.origin}${account.expectedPath}`, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      if (
        !new URL(restoredPage.url()).pathname.startsWith(account.expectedPath)
      ) {
        throw new Error(`restored session redirected to ${restoredPage.url()}`);
      }
    } finally {
      await restored.close();
    }
  } finally {
    await context.close();
  }
}

async function poll<T>(
  fn: () => Promise<T>,
  ok: (value: T) => boolean,
  label: string,
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (ok(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`timeout while waiting for ${label}`);
}

async function createLeadCleanupArtifacts(leadId: string): Promise<void> {
  createdLeadIds.push(leadId);
}

async function cleanupLeadArtifacts(): Promise<void> {
  for (const leadId of createdLeadIds) {
    await service.from("lead_events").delete().eq("lead_id", leadId);
    await service.from("task_links").delete().eq("entity_id", leadId);
    await service.from("trial_lessons").delete().eq("lead_id", leadId);
    await service.from("leads").delete().eq("id", leadId);
  }
}

async function verifyLeadToTrialToStudent(
  browser: Browser,
  tenant: TenantRow,
  instructorId: string,
): Promise<void> {
  const admin = accounts[0];
  const leadName = `E2E Lead ${Date.now()}`;
  const leadPhone = `+316${String(Date.now()).slice(-8)}`;
  const context = await browser.newContext();
  const page = await createPage(context);

  try {
    await loginViaUi(page, admin);
    await page.goto(appUrl("/backoffice/leads"), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.getByText("Nieuwe lead toevoegen", { exact: false }).click();
    await page.getByPlaceholder("Naam").fill(leadName);
    await page.getByPlaceholder("Telefoon").fill(leadPhone);
    await page.getByRole("button", { name: "Lead aanmaken" }).click();
    await page.waitForURL(
      (url) => /^\/backoffice\/leads\/[0-9a-f-]+$/i.test(url.pathname),
      {
        timeout: timeoutMs,
      },
    );

    const leadId = page.url().split("/").at(-1);
    if (!leadId) throw new Error("lead detail url did not contain an id");
    await createLeadCleanupArtifacts(leadId);

    const booked = await service.rpc("book_trial_lesson", {
      p_lead_id: leadId,
      p_tenant_id: tenant.id,
      p_instructor_id: instructorId,
      p_starts_at: plusDaysIso(5, 9),
      p_duration_min: 60,
      p_pickup_location: "E2E teststraat 1",
      p_score: 0,
      p_reason: "E2E business flow",
    });
    if (booked.error || !booked.data) {
      throw new Error(`book_trial_lesson failed: ${booked.error?.message}`);
    }
    const trialId = booked.data as string;

    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page
      .getByRole("button", { name: /^Bevestigen$/ })
      .first()
      .click();

    await poll(
      async () =>
        service
          .from("trial_lessons")
          .select("status")
          .eq("id", trialId)
          .maybeSingle(),
      (value) => value.data?.status === "confirmed",
      "trial confirmation",
    );

    await page.getByRole("button", { name: "Leerling aanmaken" }).click();
    await page.waitForURL(
      (url) => /^\/backoffice\/leerlingen\/[0-9a-f-]+$/i.test(url.pathname),
      {
        timeout: timeoutMs,
      },
    );

    const student = await poll(
      async () =>
        service
          .from("students")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("lead_id", leadId)
          .maybeSingle(),
      (value) => Boolean(value.data?.id),
      "lead conversion",
    );
    const studentId = student.data?.id as string | undefined;
    if (!studentId) {
      throw new Error("converted student row was not created");
    }
    createdStudentIds.push(studentId);
  } finally {
    await context.close();
  }
}

async function ensureInstructorStudentLink(
  tenant: TenantRow,
  adminUserId: string,
  instructorId: string,
  studentId: string,
): Promise<void> {
  const existing = await service
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", instructorId)
    .eq("student_id", studentId)
    .limit(1);
  if ((existing.count ?? 0) > 0) return;

  const startedAt = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  startedAt.setUTCMinutes(0, 0, 0);
  const endedAt = new Date(startedAt.getTime() + 60 * 60 * 1000);
  const created = await service
    .from("lessons")
    .insert({
      tenant_id: tenant.id,
      instructor_id: instructorId,
      student_id: studentId,
      starts_at: startedAt.toISOString(),
      ends_at: endedAt.toISOString(),
      status: "completed",
      location: "E2E instructeurkoppeling",
      notes: "E2E bootstrap relation for instructor/student browser flows",
      credits_cost: 60,
      created_by: adminUserId,
    })
    .select("id")
    .single();
  if (created.error || !created.data?.id) {
    throw new Error(
      `lesson bootstrap insert failed: ${created.error?.message ?? "unknown"}`,
    );
  }
  createdLessonIds.push(created.data.id as string);
}

async function createPlannedLessonForFlow(
  tenant: TenantRow,
  adminUserId: string,
  instructorId: string,
  studentId: string,
): Promise<string> {
  const startsAt = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
  const uniqueMinute = Math.floor((Date.now() / 1000) % 55);
  startsAt.setUTCMinutes(uniqueMinute, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  const created = await service
    .from("lessons")
    .insert({
      tenant_id: tenant.id,
      instructor_id: instructorId,
      student_id: studentId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "planned",
      location: "E2E lesflow",
      notes: "E2E planned lesson for instructor lifecycle flow",
      credits_cost: 60,
      created_by: adminUserId,
    })
    .select("id")
    .single();
  if (created.error || !created.data?.id) {
    throw new Error(
      `planned lesson insert failed: ${created.error?.message ?? "unknown"}`,
    );
  }
  const lessonId = created.data.id as string;
  createdLessonIds.push(lessonId);
  return lessonId;
}

async function verifyLessonPlanningAndCompletion(
  browser: Browser,
  tenant: TenantRow,
  adminUserId: string,
  instructorId: string,
  studentId: string,
): Promise<void> {
  const account = accounts[1];
  const context = await browser.newContext();
  const page = await createPage(context);

  try {
    await ensureInstructorStudentLink(
      tenant,
      adminUserId,
      instructorId,
      studentId,
    );
    const lessonId = await createPlannedLessonForFlow(
      tenant,
      adminUserId,
      instructorId,
      studentId,
    );
    await loginViaUi(page, account);
    await page.goto(appUrl(`/instructeur/lessen/${lessonId}`), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    await page.getByRole("button", { name: "Start les" }).click();
    await poll(
      async () =>
        service
          .from("lessons")
          .select("status")
          .eq("id", lessonId)
          .maybeSingle(),
      (value) => value.data?.status === "in_progress",
      "lesson start",
    );

    await page.getByRole("button", { name: "Les afronden" }).click();
    await page.getByRole("button", { name: "Volgende" }).click();
    await page.getByRole("button", { name: "Volgende" }).click();
    const overallScore = page.getByRole("slider", {
      name: "Algemene lesscore",
    });
    await overallScore.fill("7");
    await overallScore.blur();
    await page
      .locator("#finish-summary")
      .fill(
        "Je hield het tempo goed vast en werkte rustig aan kijkgedrag en positie.",
      );
    await page.getByRole("button", { name: "Volgende" }).click();
    await page.getByRole("button", { name: "Rond les af" }).click();

    await poll(
      async () =>
        service
          .from("lessons")
          .select("status")
          .eq("id", lessonId)
          .maybeSingle(),
      (value) => value.data?.status === "completed",
      "lesson completion",
    );
  } finally {
    await context.close();
  }
}

async function verifyRisInstructorToStudentJourney(
  browser: Browser,
  tenant: TenantRow,
  adminUserId: string,
  instructorId: string,
  studentId: string,
  bot: RisJourneyBot,
): Promise<void> {
  let startedAt = Date.now();
  const settings = await service
    .from("tenant_ris_settings")
    .select("lesson_card_mode, active_ris_version_id, ai_assist_enabled")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  bot.verify("RIS.PREFLIGHT.TENANT_MODE", {
    passed:
      !settings.error &&
      settings.data?.lesson_card_mode === "ris" &&
      Boolean(settings.data.active_ris_version_id) &&
      settings.data?.ai_assist_enabled === false,
    observed: settings.error
      ? `Tenantinstellingen konden niet worden gelezen: ${settings.error.message}`
      : `lesson_card_mode=${settings.data?.lesson_card_mode ?? "ontbreekt"}, actieve catalogus=${settings.data?.active_ris_version_id ? "ja" : "nee"}, AI=${settings.data?.ai_assist_enabled === false ? "uit" : "aan of onbekend"}.`,
    evidence: [
      evidence(
        "configuration",
        "tenant_ris_settings",
        "RIS-modus, actieve versie en AI-schakelaar zijn rechtstreeks uit de tenantconfiguratie gelezen.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });
  const risVersionId = settings.data!.active_ris_version_id as string;

  startedAt = Date.now();
  const [modules, scripts, steps] = await Promise.all([
    service
      .from("ris_modules")
      .select("module_number")
      .eq("ris_version_id", risVersionId),
    service
      .from("ris_scripts")
      .select("id", { count: "exact", head: true })
      .eq("ris_version_id", risVersionId)
      .eq("is_active", true),
    service
      .from("ris_step_definitions")
      .select("step_value")
      .eq("ris_version_id", risVersionId),
  ]);
  const moduleNumbers = (modules.data ?? [])
    .map((row) => Number(row.module_number))
    .sort((a, b) => a - b);
  const stepValues = new Set(
    (steps.data ?? []).map((row) => String(row.step_value)),
  );
  const expectedSteps = ["N", "1", "2", "3", "4", "5", "6", "7", "8"];
  const catalogStructureValid =
    !modules.error &&
    !scripts.error &&
    !steps.error &&
    JSON.stringify(moduleNumbers) === JSON.stringify([1, 2, 3, 4]) &&
    scripts.count === 46 &&
    stepValues.size === expectedSteps.length &&
    expectedSteps.every((value) => stepValues.has(value));
  bot.verify("RIS.PREFLIGHT.CATALOG_STRUCTURE", {
    passed: catalogStructureValid,
    observed: `Modules=${moduleNumbers.join(",") || "geen"}; actieve scripts=${scripts.count ?? "onbekend"}; stapwaarden=${[...stepValues].sort().join(",") || "geen"}.`,
    evidence: [
      evidence(
        "database",
        "ris_modules + ris_scripts + ris_step_definitions",
        "De bot vergelijkt aantallen én exacte canonieke waarden met de releasebaseline.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });
  verifyReadinessInvariants(bot);

  startedAt = Date.now();
  const curriculum = await service
    .from("curriculum_versions")
    .select(
      "id, status, content_hash, expert_validation_record_id, training_method",
    )
    .eq("source_ris_version_id", risVersionId)
    .eq("training_method", "RIS_2_0")
    .maybeSingle();
  const curriculumApproval = curriculum.data
    ? await exactExpertApproval(
        "CURRICULUM",
        curriculum.data.id as string,
        curriculum.data.content_hash as string,
        curriculum.data.expert_validation_record_id as string | null,
      )
    : { matches: false, observed: "Geen RIS 2.0-curriculum gevonden." };
  bot.verify("RIS.PREFLIGHT.CURRICULUM_VALIDATION", {
    passed:
      !curriculum.error &&
      curriculum.data?.status === "PUBLISHED" &&
      curriculumApproval.matches,
    observed: curriculum.error
      ? `Curriculumcontrole faalde: ${curriculum.error.message}`
      : `Curriculumstatus=${curriculum.data?.status ?? "ontbreekt"}; ${curriculumApproval.observed}`,
    evidence: [
      evidence(
        "database",
        "curriculum_versions + expert_validation_records",
        "Status, doel-id en content-hash zijn als één onverbrekelijke publicatiegate vergeleken.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });
  const curriculumId = curriculum.data!.id as string;

  startedAt = Date.now();
  const policies = await service
    .from("readiness_policies")
    .select(
      "id, tenant_id, status, content_hash, expert_validation_record_id, engine_version",
    )
    .eq("curriculum_version_id", curriculumId)
    .eq("status", "PUBLISHED");
  const policy =
    (policies.data ?? []).find((row) => row.tenant_id === tenant.id) ??
    (policies.data ?? []).find((row) => row.tenant_id === null);
  const policyApproval = policy
    ? await exactExpertApproval(
        "READINESS_POLICY",
        policy.id as string,
        policy.content_hash as string,
        policy.expert_validation_record_id as string | null,
      )
    : {
        matches: false,
        observed: "Geen gepubliceerd readinessbeleid gevonden.",
      };
  bot.verify("RIS.PREFLIGHT.READINESS_POLICY", {
    passed: !policies.error && Boolean(policy) && policyApproval.matches,
    observed: policies.error
      ? `Readinessbeleid kon niet worden gelezen: ${policies.error.message}`
      : `${policy ? `Gepubliceerd beleid met engine ${String(policy.engine_version)}` : "Geen toepasselijk beleid"}; ${policyApproval.observed}`,
    evidence: [
      evidence(
        "database",
        "readiness_policies + expert_validation_records",
        "Tenantbeleid heeft voorrang op globaal beleid; het actuele hash moet exact zijn goedgekeurd.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });

  startedAt = Date.now();
  const assessmentDefinitions = await service
    .from("assessment_definitions")
    .select(
      "id, assessment_type, status, content_hash, expert_validation_record_id",
    )
    .eq("curriculum_version_id", curriculumId)
    .eq("status", "PUBLISHED")
    .in("assessment_type", ["RIS_MODULE_1", "RIS_MODULE_2"]);
  const definitionApprovals = await Promise.all(
    (assessmentDefinitions.data ?? []).map(async (definition) => ({
      type: String(definition.assessment_type),
      approval: await exactExpertApproval(
        "ASSESSMENT_DEFINITION",
        definition.id as string,
        definition.content_hash as string,
        definition.expert_validation_record_id as string | null,
      ),
    })),
  );
  const publishedTypes = new Set(
    (assessmentDefinitions.data ?? []).map((row) =>
      String(row.assessment_type),
    ),
  );
  bot.verify("RIS.PREFLIGHT.MODULE_TEST_DEFINITIONS", {
    passed:
      !assessmentDefinitions.error &&
      publishedTypes.has("RIS_MODULE_1") &&
      publishedTypes.has("RIS_MODULE_2") &&
      definitionApprovals.length === 2 &&
      definitionApprovals.every((item) => item.approval.matches),
    observed: assessmentDefinitions.error
      ? `Moduletoetsdefinities konden niet worden gelezen: ${assessmentDefinitions.error.message}`
      : `Gepubliceerd: ${[...publishedTypes].sort().join(",") || "geen"}; exacte expertgoedkeuringen=${definitionApprovals.filter((item) => item.approval.matches).length}/2.`,
    evidence: [
      evidence(
        "database",
        "assessment_definitions + expert_validation_records",
        "Beide vereiste moduletoetsdefinities zijn afzonderlijk op status, doel en hash gecontroleerd.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });

  startedAt = Date.now();
  const enrollment = await service
    .from("training_enrollments")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("student_id", studentId)
    .eq("training_method", "RIS_2_0")
    .eq("status", "ACTIVE")
    .maybeSingle();
  bot.verify("RIS.PREFLIGHT.ENROLLMENT", {
    passed: !enrollment.error && Boolean(enrollment.data?.id),
    observed: enrollment.error
      ? `Inschrijving kon niet worden gelezen: ${enrollment.error.message}`
      : `Actieve RIS 2.0-inschrijving=${enrollment.data?.id ? "ja" : "nee"}.`,
    evidence: [
      evidence(
        "database",
        "training_enrollments",
        "Tenant, leerling, methode en actieve status zijn gezamenlijk gefilterd.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });

  startedAt = Date.now();
  const firstScript = await service
    .from("ris_scripts")
    .select("id, title")
    .eq("ris_version_id", risVersionId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  bot.verify("RIS.JOURNEY.FOCUS_SCRIPT", {
    passed: !firstScript.error && Boolean(firstScript.data?.id),
    observed: firstScript.error
      ? `Focusscript kon niet worden gelezen: ${firstScript.error.message}`
      : `Actief, catalogusgebonden focusscript=${firstScript.data?.id ? "gevonden" : "niet gevonden"}.`,
    evidence: [
      evidence(
        "database",
        "ris_scripts",
        "Het eerste actieve script uit de actieve versie wordt als deterministische fixture gebruikt.",
      ),
    ],
    durationMs: Date.now() - startedAt,
  });
  const firstScriptId = firstScript.data!.id as string;
  const firstScriptTitle = firstScript.data!.title as string;

  const progressBefore = await service
    .from("student_ris_progress")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("student_id", studentId)
    .eq("script_id", firstScriptId)
    .maybeSingle();
  if (progressBefore.error) {
    throw new Error(
      `RIS progress snapshot failed: ${progressBefore.error.message}`,
    );
  }
  risProgressSnapshots.push({
    tenantId: tenant.id,
    studentId,
    scriptId: firstScriptId,
    row: (progressBefore.data as Record<string, unknown> | null) ?? null,
  });

  const lessonId = await createPlannedLessonForFlow(
    tenant,
    adminUserId,
    instructorId,
    studentId,
  );
  const instructorContext = await browser.newContext();
  const instructorPage = await createPage(instructorContext);
  const reflectionText = `E2E zelfreflectie ${Date.now()}`;
  const learnerWish = `Ik wil ${firstScriptTitle} verder oefenen`;

  try {
    await loginViaUi(instructorPage, accounts[1]);
    await instructorPage.goto(appUrl(`/instructeur/lessen/${lessonId}`), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await instructorPage
      .getByRole("tab", { name: "Beoordeling", exact: true })
      .click();
    const firstModule = instructorPage.locator("details").first();
    if (!(await firstModule.getAttribute("open"))) {
      await firstModule.locator("summary").click();
    }
    startedAt = Date.now();
    const slider = instructorPage
      .getByRole("slider", { name: /RIS-stap voor/i })
      .first();
    await slider.press("End");
    const separatedObservation = await poll(
      async () =>
        service
          .from("ris_script_assessments")
          .select(
            "id, lesson_card_id, concept_ris_step, concept_performance_outcome, concept_support_level, concept_safety_status, ready_for_test",
          )
          .eq("tenant_id", tenant.id)
          .eq("script_id", firstScriptId)
          .eq("lesson_id", lessonId)
          .maybeSingle(),
      (value) =>
        value.data?.concept_ris_step === "8" &&
        Boolean(value.data?.concept_performance_outcome) &&
        Boolean(value.data?.concept_support_level) &&
        Boolean(value.data?.concept_safety_status),
      "separated RIS observation",
    );
    bot.verify("RIS.JOURNEY.SEPARATED_OBSERVATION", {
      passed:
        separatedObservation.data?.concept_ris_step === "8" &&
        Boolean(separatedObservation.data?.concept_performance_outcome) &&
        Boolean(separatedObservation.data?.concept_support_level) &&
        Boolean(separatedObservation.data?.concept_safety_status),
      observed: `Stap=${String(separatedObservation.data?.concept_ris_step)}; prestatie=${String(separatedObservation.data?.concept_performance_outcome)}; ondersteuning=${String(separatedObservation.data?.concept_support_level)}; veiligheid=${String(separatedObservation.data?.concept_safety_status)}.`,
      evidence: [
        evidence(
          "ui",
          `/instructeur/lessen/{les}/beoordeling`,
          "De bot bedient het echte beoordelingsformulier met Playwright.",
        ),
        evidence(
          "database",
          "ris_script_assessments",
          "Alle vier onafhankelijke conceptvelden zijn na autosave teruggelezen.",
        ),
      ],
      durationMs: Date.now() - startedAt,
    });
    bot.verify("RIS.JOURNEY.STAGE_NOT_MASTERY", {
      passed: separatedObservation.data?.ready_for_test === false,
      observed: `RIS-stap=8 en legacy ready_for_test=${String(separatedObservation.data?.ready_for_test)}; prestatie en veiligheid blijven afzonderlijke velden.`,
      evidence: [
        evidence(
          "database",
          "ris_script_assessments",
          "De pensioen-trigger houdt de handmatige ready-boolean uit, ook bij de hoogste instructiestap.",
        ),
        evidence(
          "calculation",
          "readiness release invariant",
          "De controle accepteert geen directe gelijkstelling stap 8 = toets- of examenrijp.",
        ),
      ],
      durationMs: 0,
    });

    await instructorPage
      .getByRole("tab", { name: "Reflectie", exact: true })
      .click();
    startedAt = Date.now();
    await instructorPage
      .getByRole("radio", { name: /Door leerling zelf/i })
      .check();
    await instructorPage
      .getByLabel("Reflectie in een zin")
      .fill(reflectionText);
    const savedReflection = await poll(
      async () =>
        service
          .from("ris_guided_reflections")
          .select("entry_mode, one_sentence_reflection")
          .eq("tenant_id", tenant.id)
          .eq("one_sentence_reflection", reflectionText)
          .maybeSingle(),
      (value) => value.data?.entry_mode === "student_self",
      "student-authored reflection autosave",
    );
    bot.verify("RIS.JOURNEY.REFLECTION_AUTHORSHIP", {
      passed:
        savedReflection.data?.entry_mode === "student_self" &&
        savedReflection.data?.one_sentence_reflection === reflectionText,
      observed: `entry_mode=${String(savedReflection.data?.entry_mode)}; unieke reflectiemarker is aan dezelfde reflectie gekoppeld.`,
      evidence: [
        evidence(
          "ui",
          `/instructeur/lessen/{les}/reflectie`,
          "De optie 'Door leerling zelf' en het reflectieveld zijn via de gebruikersinterface ingevuld.",
        ),
        evidence(
          "database",
          "ris_guided_reflections",
          "Entry mode en unieke tekstmarker zijn samen teruggelezen.",
        ),
      ],
      durationMs: Date.now() - startedAt,
    });

    const draftCard = await service
      .from("ris_lesson_cards")
      .select("id, publication_status")
      .eq("tenant_id", tenant.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    startedAt = Date.now();
    const draftStudentContext = await browser.newContext();
    const draftStudentPage = await createPage(draftStudentContext);
    let draftVisible = false;
    try {
      await loginViaUi(draftStudentPage, accounts[2]);
      await draftStudentPage.goto(appUrl(`/leerling/lessen/${lessonId}`), {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      draftVisible = await draftStudentPage
        .getByText(reflectionText, { exact: true })
        .isVisible()
        .catch(() => false);
    } finally {
      await draftStudentContext.close();
    }
    bot.verify("RIS.JOURNEY.DRAFT_PRIVACY", {
      passed:
        !draftCard.error &&
        draftCard.data?.publication_status !== "waiting_for_student_response" &&
        draftCard.data?.publication_status !== "fully_completed" &&
        !draftVisible,
      observed: `Conceptstatus=${String(draftCard.data?.publication_status)}; unieke reflectiemarker zichtbaar voor leerling=${draftVisible ? "ja" : "nee"}.`,
      evidence: [
        evidence(
          "database",
          "ris_lesson_cards",
          "De kaartstatus is vóór publicatie vastgelegd.",
        ),
        evidence(
          "ui",
          `/leerling/lessen/{les}`,
          "Een afzonderlijke leerlingbrowser zocht vóór publicatie exact naar de unieke conceptmarker.",
        ),
      ],
      durationMs: Date.now() - startedAt,
    });

    await instructorPage.getByRole("tab", { name: /Samenvatting/ }).click();
    instructorPage.once("dialog", (dialog) => void dialog.accept());
    startedAt = Date.now();
    await instructorPage
      .getByRole("button", { name: "Afronden & publiceren" })
      .click();

    const publishedCard = await poll(
      async () =>
        service
          .from("ris_lesson_cards")
          .select("id, publication_status")
          .eq("tenant_id", tenant.id)
          .eq("lesson_id", lessonId)
          .maybeSingle(),
      (value) =>
        value.data?.publication_status === "waiting_for_student_response",
      "RIS publication",
    );
    const cardId = publishedCard.data?.id as string | undefined;
    if (!cardId) throw new Error("published RIS card id missing");
    bot.verify("RIS.JOURNEY.PUBLICATION", {
      passed:
        publishedCard.data?.publication_status ===
        "waiting_for_student_response",
      observed: `Publicatiestatus=${String(publishedCard.data?.publication_status)}.`,
      evidence: [
        evidence(
          "ui",
          `/instructeur/lessen/{les}/samenvatting`,
          "De echte actie 'Afronden & publiceren' is bevestigd.",
        ),
        evidence(
          "database",
          "ris_lesson_cards",
          "De verwachte expliciete publicatiestatus is teruggelezen.",
        ),
      ],
      durationMs: Date.now() - startedAt,
    });

    const studentContext = await browser.newContext();
    const studentPage = await createPage(studentContext);
    try {
      startedAt = Date.now();
      await loginViaUi(studentPage, accounts[2]);
      await studentPage.goto(appUrl(`/leerling/lessen/${lessonId}`), {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await studentPage.getByText(reflectionText, { exact: true }).waitFor();
      await studentPage
        .getByText("Door leerling zelf", { exact: true })
        .waitFor();
      bot.verify("RIS.JOURNEY.STUDENT_VISIBILITY", {
        passed: true,
        observed:
          "De unieke gepubliceerde reflectiemarker en het label 'Door leerling zelf' zijn beide zichtbaar.",
        evidence: [
          evidence(
            "ui",
            `/leerling/lessen/{les}`,
            "De leerlingbrowser wachtte op de exacte tekst en het exacte auteurschapslabel.",
          ),
        ],
        durationMs: Date.now() - startedAt,
      });
      startedAt = Date.now();
      await studentPage
        .getByPlaceholder("Mijn korte reactie op deze les...")
        .fill("De gepubliceerde feedback klopt.");
      await studentPage
        .getByPlaceholder("Volgende les wil ik graag oefenen met...")
        .fill(learnerWish);
      await studentPage
        .getByRole("button", { name: "Reactie opslaan" })
        .click();
      await studentPage.getByText("Je reactie is opgeslagen.").waitFor();
      const response = await poll(
        async () =>
          service
            .from("student_post_lesson_responses")
            .select("student_id, comment_text, next_lesson_wish")
            .eq("tenant_id", tenant.id)
            .eq("lesson_card_id", cardId)
            .maybeSingle(),
        (value) =>
          value.data?.student_id === studentId &&
          value.data?.comment_text === "De gepubliceerde feedback klopt." &&
          value.data?.next_lesson_wish === learnerWish,
        "student response persistence",
      );
      bot.verify("RIS.JOURNEY.STUDENT_RESPONSE", {
        passed:
          response.data?.student_id === studentId &&
          response.data?.comment_text === "De gepubliceerde feedback klopt." &&
          response.data?.next_lesson_wish === learnerWish,
        observed:
          "Reactie en leerwens zijn exact teruggelezen op dezelfde tenant, leerling en leskaart.",
        evidence: [
          evidence(
            "ui",
            `/leerling/lessen/{les}`,
            "De leerling heeft beide velden ingevuld en de bevestiging ontvangen.",
          ),
          evidence(
            "database",
            "student_post_lesson_responses",
            "Tenant-, leerling- en leskaartrelatie plus beide waarden zijn gecontroleerd.",
          ),
        ],
        durationMs: Date.now() - startedAt,
      });
    } finally {
      await studentContext.close();
    }

    startedAt = Date.now();
    const completedCard = await poll(
      async () =>
        service
          .from("ris_lesson_cards")
          .select("publication_status")
          .eq("id", cardId)
          .maybeSingle(),
      (value) => value.data?.publication_status === "fully_completed",
      "student response completion",
    );
    bot.verify("RIS.JOURNEY.COMPLETION", {
      passed: completedCard.data?.publication_status === "fully_completed",
      observed: `Eindstatus=${String(completedCard.data?.publication_status)}.`,
      evidence: [
        evidence(
          "database",
          "ris_lesson_cards",
          "De status is na de respons opnieuw gepolld tot de gesloten toestand.",
        ),
      ],
      durationMs: Date.now() - startedAt,
    });

    const nextLessonId = await createPlannedLessonForFlow(
      tenant,
      adminUserId,
      instructorId,
      studentId,
    );
    startedAt = Date.now();
    await instructorPage.goto(appUrl(`/instructeur/lessen/${nextLessonId}`), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await instructorPage
      .getByRole("tab", { name: "Plankaart", exact: true })
      .click();
    await instructorPage.getByText(learnerWish, { exact: true }).waitFor();
    await instructorPage
      .getByText("Regelgebaseerd lesvoorstel", { exact: true })
      .waitFor();
    bot.verify("RIS.JOURNEY.NEXT_FOCUS", {
      passed: true,
      observed:
        "De volgende plankaart toont zowel de exacte leerlingwens als het label 'Regelgebaseerd lesvoorstel'.",
      evidence: [
        evidence(
          "ui",
          `/instructeur/lessen/{volgende-les}/plankaart`,
          "De bot verifieert de twee verklarende signalen via exacte UI-locators.",
        ),
        evidence(
          "calculation",
          "next-focus rule engine",
          "De verwachte output is expliciet regelgebaseerd en doet geen AI-claim.",
        ),
      ],
      durationMs: Date.now() - startedAt,
    });

    startedAt = Date.now();
    const audit = await service
      .from("audit_log")
      .select("action, actor_user_id")
      .eq("tenant_id", tenant.id)
      .eq("target_type", "ris_lesson_card")
      .eq("target_id", cardId)
      .in("action", [
        "ris.lesson_card_published",
        "ris.student_response_submitted",
      ]);
    const auditActions = new Set(
      (audit.data ?? []).map((row) => String(row.action)),
    );
    const actorsPresent = (audit.data ?? []).every((row) =>
      Boolean(row.actor_user_id),
    );
    bot.verify("RIS.JOURNEY.AUDIT_TRAIL", {
      passed:
        !audit.error &&
        auditActions.has("ris.lesson_card_published") &&
        auditActions.has("ris.student_response_submitted") &&
        actorsPresent,
      observed: audit.error
        ? `Audittrail kon niet worden gelezen: ${audit.error.message}`
        : `Auditacties=${[...auditActions].sort().join(",") || "geen"}; actor op ieder event=${actorsPresent ? "ja" : "nee"}.`,
      evidence: [
        evidence(
          "audit",
          "audit_log",
          "Publicatie en leerlingreactie zijn op dezelfde leskaart en met actor gecontroleerd.",
        ),
      ],
      durationMs: Date.now() - startedAt,
    });
  } finally {
    await instructorContext.close();
  }
}

async function verifyMessaging(
  browser: Browser,
  tenant: TenantRow,
  instructorId: string,
): Promise<void> {
  const studentAccount = accounts[2];
  const instructorAccount = accounts[1];
  const student = await lookupStudentByUserEmail(tenant, studentAccount.email);
  const studentMessage = `E2E student ping ${Date.now()}`;
  const instructorReply = `E2E instructeur reply ${Date.now()}`;

  const studentContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentPage = await createPage(studentContext);
  const instructorPage = await createPage(instructorContext);

  try {
    const adminUserId = await lookupUserIdByEmail(accounts[0].email);
    await ensureInstructorStudentLink(
      tenant,
      adminUserId,
      instructorId,
      student.id,
    );
    await loginViaUi(studentPage, studentAccount);
    await studentPage.goto(
      appUrl(
        `/leerling/berichten?instructor=${encodeURIComponent(instructorId)}`,
      ),
      { waitUntil: "domcontentloaded", timeout: timeoutMs },
    );
    await studentPage
      .getByPlaceholder("Typ een bericht...")
      .fill(studentMessage);
    await studentPage.getByRole("button", { name: "Verzenden" }).click();

    const conversation = await poll(
      async () =>
        service
          .from("chat_conversations")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("student_id", student.id)
          .eq("instructor_id", instructorId)
          .maybeSingle(),
      (value) => Boolean(value.data?.id),
      "conversation creation",
    );
    const conversationId = conversation.data?.id as string | undefined;
    if (!conversationId) throw new Error("conversation id not found");
    createdConversationIds.push(conversationId);

    const sentMessage = await poll(
      async () =>
        service
          .from("chat_messages")
          .select("id, body")
          .eq("conversation_id", conversationId)
          .eq("body", studentMessage)
          .maybeSingle(),
      (value) => Boolean(value.data?.id),
      "student message persistence",
    );
    if (sentMessage.data?.id)
      createdMessageIds.push(sentMessage.data.id as string);
    await studentPage.reload({
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await studentPage
      .getByText(studentMessage, { exact: true })
      .first()
      .waitFor({ timeout: timeoutMs });

    await loginViaUi(instructorPage, instructorAccount);
    await instructorPage.goto(
      appUrl(
        `/instructeur/berichten?conversation=${encodeURIComponent(conversationId)}`,
      ),
      { waitUntil: "domcontentloaded", timeout: timeoutMs },
    );
    await instructorPage
      .getByText(studentMessage, { exact: true })
      .first()
      .waitFor({ timeout: timeoutMs });
    await instructorPage
      .getByPlaceholder("Typ een bericht...")
      .fill(instructorReply);
    await instructorPage.getByRole("button", { name: "Verzenden" }).click();

    const reply = await poll(
      async () =>
        service
          .from("chat_messages")
          .select("id, body")
          .eq("conversation_id", conversationId)
          .eq("body", instructorReply)
          .maybeSingle(),
      (value) => Boolean(value.data?.id),
      "instructor reply persistence",
    );
    if (reply.data?.id) createdMessageIds.push(reply.data.id as string);
    await instructorPage.reload({
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await instructorPage
      .getByText(instructorReply, { exact: true })
      .first()
      .waitFor({ timeout: timeoutMs });

    await studentPage.reload({
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await studentPage
      .locator("p.whitespace-pre-wrap")
      .filter({ hasText: instructorReply })
      .first()
      .waitFor({ timeout: timeoutMs });
  } finally {
    await studentContext.close();
    await instructorContext.close();
  }
}

async function createBranchIsolationFixture(
  tenant: TenantRow,
  adminUserId: string,
): Promise<BranchFixture> {
  const stamp = Date.now();
  const password = `BranchE2E!${stamp}`;

  const branchA = await service.rpc("create_branch", {
    p_tenant_id: tenant.id,
    p_name: `E2E Branch A ${stamp}`,
    p_slug: `e2e-branch-a-${stamp}`,
    p_address: null,
    p_city: "Den Haag",
    p_actor: adminUserId,
  });
  const branchB = await service.rpc("create_branch", {
    p_tenant_id: tenant.id,
    p_name: `E2E Branch B ${stamp}`,
    p_slug: `e2e-branch-b-${stamp}`,
    p_address: null,
    p_city: "Rotterdam",
    p_actor: adminUserId,
  });
  if (branchA.error || !branchA.data || branchB.error || !branchB.data) {
    throw new Error(
      `branch setup failed: ${branchA.error?.message ?? branchB.error?.message}`,
    );
  }

  const branchAId = branchA.data as string;
  const branchBId = branchB.data as string;
  createdBranchIds.push(branchAId, branchBId);

  const branchManagerEmail = `_e2e-branch-manager-${stamp}@nxtdrive-test.invalid`;
  const managerUser = await service.auth.admin.createUser({
    email: branchManagerEmail,
    email_confirm: true,
    password,
  });
  if (managerUser.error || !managerUser.data.user) {
    throw new Error(
      `branch manager createUser failed: ${managerUser.error?.message}`,
    );
  }

  const branchManagerUserId = managerUser.data.user.id;
  createdUserIds.push(branchManagerUserId);
  await service.from("profiles").upsert({
    id: branchManagerUserId,
    email: branchManagerEmail,
    full_name: `E2E Branchmanager ${stamp}`,
  });

  const membership = await service
    .from("memberships")
    .insert({
      tenant_id: tenant.id,
      user_id: branchManagerUserId,
      role: "branch_manager",
    })
    .select("id")
    .single();
  if (membership.error || !membership.data) {
    throw new Error(
      `branch manager membership failed: ${membership.error?.message}`,
    );
  }

  const branchManagerMembershipId = membership.data.id as string;
  createdMembershipIds.push(branchManagerMembershipId);
  const scoped = await service.rpc("set_membership_branches", {
    p_membership_id: branchManagerMembershipId,
    p_branch_ids: [branchAId],
    p_actor: adminUserId,
  });
  if (scoped.error) {
    throw new Error(`set_membership_branches failed: ${scoped.error.message}`);
  }

  const studentAName = `E2E Branch A Student ${stamp}`;
  const studentBName = `E2E Branch B Student ${stamp}`;
  const students = await service
    .from("students")
    .insert([
      {
        tenant_id: tenant.id,
        full_name: studentAName,
        branch_id: branchAId,
        phone: `+316${String(stamp).slice(-8)}`,
      },
      {
        tenant_id: tenant.id,
        full_name: studentBName,
        branch_id: branchBId,
        phone: `+317${String(stamp).slice(-8)}`,
      },
    ])
    .select("id, full_name, branch_id");
  if (students.error || !students.data) {
    throw new Error(`branch students setup failed: ${students.error?.message}`);
  }

  const studentA = students.data.find((row) => row.branch_id === branchAId);
  const studentB = students.data.find((row) => row.branch_id === branchBId);
  if (!studentA?.id || !studentB?.id) {
    throw new Error("branch students were not created as expected");
  }
  createdStudentIds.push(studentA.id as string, studentB.id as string);

  return {
    branchAId,
    branchBId,
    branchManagerUserId,
    branchManagerMembershipId,
    branchManagerEmail,
    branchManagerPassword: password,
    studentAId: studentA.id as string,
    studentBId: studentB.id as string,
    studentAName,
    studentBName,
  };
}

async function verifyBranchIsolation(
  browser: Browser,
  tenant: TenantRow,
  adminUserId: string,
): Promise<void> {
  const fixture = await createBranchIsolationFixture(tenant, adminUserId);
  const context = await browser.newContext();
  const page = await createPage(context);

  try {
    await loginViaUi(page, {
      label: "tenant admin",
      email: fixture.branchManagerEmail,
      password: fixture.branchManagerPassword,
      expectedPath: "/backoffice",
    });
    await page.goto(appUrl("/backoffice/leerlingen"), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page
      .locator(`a[href="/backoffice/leerlingen/${fixture.studentAId}"]`)
      .first()
      .waitFor({ timeout: timeoutMs });
    const branchBVisible = await page
      .locator(`a[href="/backoffice/leerlingen/${fixture.studentBId}"]`)
      .first()
      .isVisible()
      .catch(() => false);
    if (branchBVisible) {
      throw new Error("branch-scoped user can see branch B student");
    }
  } finally {
    await context.close();
  }
}

function deriveTenantHost(base: string, tenantSlug: string): string | null {
  const configured = process.env["E2E_TENANT_HOST"]?.trim();
  if (configured) return configured;
  const url = new URL(base);
  if (url.hostname.startsWith("app.")) {
    return `${tenantSlug}.${url.hostname.slice(4)}`;
  }
  return null;
}

async function verifyWhiteLabelHost(
  browser: Browser,
  tenant: TenantRow,
): Promise<void> {
  const tenantHost = deriveTenantHost(baseUrl, tenant.slug);
  if (!tenantHost) {
    record(
      "SKIP",
      "white-label subdomain shell",
      "set E2E_TENANT_HOST to verify host routing",
    );
    return;
  }

  const page = await createPage(await browser.newContext());
  try {
    await page.goto(`https://${tenantHost}/login`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page
      .getByRole("heading", { name: "Inloggen" })
      .waitFor({ timeout: timeoutMs });
    const bodyText = await page.locator("body").innerText();
    const matchesTenantText =
      bodyText.includes(`Log in op ${tenant.name}.`) ||
      bodyText.includes(tenant.name);
    if (!matchesTenantText) {
      throw new Error(`tenant branding text not detected on ${tenantHost}`);
    }
    if (bodyText.includes("Aangedreven door NXTDRIVE")) {
      throw new Error(
        "white-label shell still shows public NXTDRIVE footer copy",
      );
    }
  } finally {
    await page.context().close();
  }

  const customHost = process.env["E2E_CUSTOM_DOMAIN_HOST"]?.trim();
  if (!customHost) {
    record(
      "SKIP",
      "white-label custom-domain shell",
      "set E2E_CUSTOM_DOMAIN_HOST to verify custom domain routing",
    );
    return;
  }

  const page2 = await createPage(await browser.newContext());
  try {
    await page2.goto(`https://${customHost}/login`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page2
      .getByRole("heading", { name: "Inloggen" })
      .waitFor({ timeout: timeoutMs });
    const bodyText = await page2.locator("body").innerText();
    if (!bodyText.includes(tenant.name)) {
      throw new Error(`tenant name not visible on custom host ${customHost}`);
    }
  } finally {
    await page2.context().close();
  }
}

async function createTestInvoice(
  tenant: TenantRow,
  adminUserId: string,
  studentId: string,
): Promise<string> {
  const created = await service.rpc("create_invoice", {
    p_tenant_id: tenant.id,
    p_actor: adminUserId,
    p_student_id: studentId,
    p_due_date: null,
    p_notes: "E2E betaalflow",
  });
  if (created.error || !created.data) {
    throw new Error(`create_invoice failed: ${created.error?.message}`);
  }
  const invoiceId = created.data as string;
  createdInvoiceIds.push(invoiceId);

  const line = await service.rpc("add_invoice_line", {
    p_invoice_id: invoiceId,
    p_tenant_id: tenant.id,
    p_actor: adminUserId,
    p_description: "E2E betaalregel",
    p_quantity: 1,
    p_unit_price_cents: 4500,
    p_tax_rate_bp: 2100,
    p_related_package_id: null,
  });
  if (line.error) {
    throw new Error(`add_invoice_line failed: ${line.error.message}`);
  }

  const status = await service.rpc("set_invoice_status", {
    p_invoice_id: invoiceId,
    p_tenant_id: tenant.id,
    p_actor: adminUserId,
    p_status: "open",
  });
  if (status.error) {
    throw new Error(`set_invoice_status failed: ${status.error.message}`);
  }

  return invoiceId;
}

async function verifyPayments(
  browser: Browser,
  tenant: TenantRow,
  adminUserId: string,
): Promise<void> {
  const studentAccount = accounts[2];
  const student = await lookupStudentByUserEmail(tenant, studentAccount.email);
  const invoiceId = await createTestInvoice(tenant, adminUserId, student.id);

  const context = await browser.newContext();
  const page = await createPage(context);
  try {
    await loginViaUi(page, studentAccount);
    await page.goto(appUrl("/leerling/betalingen"), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page
      .getByRole("heading", { name: "Betalingen" })
      .waitFor({ timeout: timeoutMs });
    await page
      .getByText(/^Factuur #/)
      .first()
      .waitFor({ timeout: timeoutMs });

    const payButton = page.getByRole("button", { name: /Betaal nu/i });
    if ((await payButton.count()) === 0) {
      record(
        "SKIP",
        "student payment redirect boundary",
        "online payment is not active for this tenant",
      );
      return;
    }

    if (!allowPaymentRedirect) {
      record(
        "SKIP",
        "student payment redirect boundary",
        "set E2E_ENABLE_PAYMENT_REDIRECT=1 to follow external PSP redirect",
      );
      return;
    }

    await payButton.first().click();
    await page.waitForURL(
      (url) =>
        !url.pathname.startsWith("/leerling") &&
        !url.pathname.startsWith("/facturen") &&
        !url.pathname.startsWith("/betalingen"),
      { timeout: timeoutMs },
    );
  } finally {
    await context.close();
    const paymentIdRows = await service
      .from("payment_records")
      .select("id")
      .eq("invoice_id", invoiceId);
    for (const row of paymentIdRows.data ?? []) {
      await service
        .from("payment_records")
        .delete()
        .eq("id", row.id as string);
    }
  }
}

async function cleanupLessons(): Promise<void> {
  for (const lessonId of createdLessonIds) {
    const cards = await service
      .from("ris_lesson_cards")
      .select("id")
      .eq("lesson_id", lessonId);
    const cardIds = (cards.data ?? []).map((row) => row.id as string);
    if (cardIds.length > 0) {
      await ignoreQuery(
        service
          .from("student_post_lesson_responses")
          .delete()
          .in("lesson_card_id", cardIds),
      );
      await ignoreQuery(
        service
          .from("ris_guided_reflections")
          .delete()
          .in("lesson_card_id", cardIds),
      );
      await ignoreQuery(
        service
          .from("ris_script_assessments")
          .delete()
          .in("lesson_card_id", cardIds),
      );
      await ignoreQuery(
        service.from("ris_lesson_cards").delete().in("id", cardIds),
      );
    }
    const planningCards = await service
      .from("planning_cards")
      .select("id")
      .eq("next_lesson_id", lessonId);
    const planningCardIds = (planningCards.data ?? []).map(
      (row) => row.id as string,
    );
    if (planningCardIds.length > 0) {
      await ignoreQuery(
        service
          .from("planning_card_goals")
          .delete()
          .in("planning_card_id", planningCardIds),
      );
      await ignoreQuery(
        service.from("planning_cards").delete().in("id", planningCardIds),
      );
    }
    await service
      .from("lesson_skill_scores")
      .delete()
      .eq("lesson_id", lessonId);
    await service.from("lesson_notes").delete().eq("lesson_id", lessonId);
    await service.from("lessons").delete().eq("id", lessonId);
  }
  for (const snapshot of risProgressSnapshots) {
    if (snapshot.row) {
      await ignoreQuery(
        service.from("student_ris_progress").upsert(snapshot.row),
      );
    } else {
      await ignoreQuery(
        service
          .from("student_ris_progress")
          .delete()
          .eq("tenant_id", snapshot.tenantId)
          .eq("student_id", snapshot.studentId)
          .eq("script_id", snapshot.scriptId),
      );
    }
  }
}

async function cleanupStudents(): Promise<void> {
  for (const studentId of createdStudentIds) {
    await ignoreQuery(
      service.from("student_reviews").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("lesson_skill_scores").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("lesson_notes").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("credit_ledger").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("invoice_lines").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("payment_records").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("invoices").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("trial_lessons").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("lessons").delete().eq("student_id", studentId),
    );
    await ignoreQuery(
      service.from("chat_conversations").delete().eq("student_id", studentId),
    );
    await service.from("students").delete().eq("id", studentId);
  }
}

async function cleanupInvoices(): Promise<void> {
  for (const invoiceId of createdInvoiceIds) {
    await ignoreQuery(
      service.from("payment_records").delete().eq("invoice_id", invoiceId),
    );
    await ignoreQuery(
      service.from("invoice_lines").delete().eq("invoice_id", invoiceId),
    );
    await ignoreQuery(service.from("invoices").delete().eq("id", invoiceId));
  }
}

async function cleanupMembershipsAndUsers(): Promise<void> {
  for (const membershipId of createdMembershipIds) {
    await ignoreQuery(
      service
        .from("membership_branches")
        .delete()
        .eq("membership_id", membershipId),
    );
    await ignoreQuery(
      service.from("memberships").delete().eq("id", membershipId),
    );
  }
  for (const userId of createdUserIds) {
    await ignoreQuery(service.from("profiles").delete().eq("id", userId));
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
  }
}

async function cleanupBranches(): Promise<void> {
  for (const branchId of createdBranchIds) {
    await ignoreQuery(service.from("branches").delete().eq("id", branchId));
  }
}

async function cleanupMessagesAndConversations(): Promise<void> {
  for (const messageId of createdMessageIds) {
    await ignoreQuery(
      service.from("chat_messages").delete().eq("id", messageId),
    );
  }
  for (const conversationId of createdConversationIds) {
    const remaining = await service
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    if ((remaining.count ?? 0) === 0) {
      await ignoreQuery(
        service.from("chat_conversations").delete().eq("id", conversationId),
      );
    }
  }
}

function finalizeRisJourneyReport(): void {
  if (!risJourneyBot || risJourneyReportWritten) return;
  risJourneyReportWritten = true;
  risJourneyBot.blockRemaining(
    "De journey is vóór deze controle gestopt; zie de eerst gefaalde of geblokkeerde controle.",
  );
  const { report, files } = risJourneyBot.writeReports({
    outputDirectory: risOutputDirectory,
    previousReportPath:
      process.env["E2E_RIS_PREVIOUS_REPORT"]?.trim() || undefined,
  });
  console.log(
    `${report.outcome} RIS journeybot report - ${report.summary.passed}/${report.summary.total} passed, ${report.summary.explainabilityScore}% explainable`,
  );
  for (const file of files) console.log(`REPORT ${file}`);
  const journeyAlreadyFailed = results.some(
    (result) =>
      result.status === "FAIL" &&
      result.name.startsWith("RIS instructor assessment"),
  );
  if (report.outcome !== "PASS" && !journeyAlreadyFailed) {
    record(
      "FAIL",
      "RIS journeybot release baseline",
      `${report.outcome}; failed=${report.summary.failed}, blocked=${report.summary.blocked}, timing regressions=${report.comparison.durationRegressions.length}`,
    );
  }
}

function startRisJourneyBot(): RisJourneyBot {
  if (!risJourneyBot) {
    risJourneyBot = new RisJourneyBot({
      baseline: loadRisJourneyBaseline(risBaselinePath),
      target: baseUrl,
      commitSha: process.env["GITHUB_SHA"]?.trim() || null,
    });
  }
  return risJourneyBot;
}

async function main(): Promise<void> {
  console.log(`${bannerFor(env)} - browser business-flow E2E`);
  console.log(`Target: ${baseUrl}`);
  if (risJourneyOnly) console.log("Mode: uitgebreide RIS journeybot");
  console.log("");

  const tenant = await lookupTenant();
  const adminUserId = await lookupUserIdByEmail(accounts[0].email);
  const instructorUserId = await lookupUserIdByEmail(accounts[1].email);
  const student = await lookupStudentByUserEmail(tenant, accounts[2].email);

  const browser = await createBrowser();
  try {
    if (!risJourneyOnly) {
      for (const account of accounts) {
        await expect(
          `login + session persistence (${account.label})`,
          async () => {
            await verifyRoleLogin(browser, account);
          },
        );
      }

      await expect("lead -> trial -> student conversion", async () => {
        await verifyLeadToTrialToStudent(browser, tenant, instructorUserId);
      });

      await expect("lesson scheduling -> start -> completion", async () => {
        await verifyLessonPlanningAndCompletion(
          browser,
          tenant,
          adminUserId,
          instructorUserId,
          student.id,
        );
      });
    }

    if (enableRisJourney) {
      const bot = startRisJourneyBot();
      await expect(
        "RIS instructor assessment -> self-reflection -> publication -> student response -> next focus",
        async () => {
          await verifyRisInstructorToStudentJourney(
            browser,
            tenant,
            adminUserId,
            instructorUserId,
            student.id,
            bot,
          );
        },
      );
      finalizeRisJourneyReport();
    } else {
      record(
        "SKIP",
        "RIS instructor-to-student journey",
        "set E2E_ENABLE_RIS_JOURNEY=1 on a validated RIS test tenant",
      );
    }

    if (!risJourneyOnly) {
      await expect("student <-> instructor messaging", async () => {
        await verifyMessaging(browser, tenant, instructorUserId);
      });

      await expect("branch-scoped student visibility", async () => {
        await verifyBranchIsolation(browser, tenant, adminUserId);
      });

      await expect("white-label subdomain shell", async () => {
        await verifyWhiteLabelHost(browser, tenant);
      });

      await expect("student payments + checkout entrypoint", async () => {
        await verifyPayments(browser, tenant, adminUserId);
      });
    }
  } finally {
    await browser.close();
    await cleanupMessagesAndConversations();
    await cleanupInvoices();
    await cleanupLessons();
    await cleanupStudents();
    await cleanupLeadArtifacts();
    await cleanupMembershipsAndUsers();
    await cleanupBranches();
    finalizeRisJourneyReport();
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} business-flow E2E check(s) failed.`);
    process.exit(1);
  }
  console.log("Business-flow E2E checks passed.");
}

main().catch((error) => {
  if (enableRisJourney) startRisJourneyBot();
  finalizeRisJourneyReport();
  record(
    "FAIL",
    "business-flow suite",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exit(1);
});
