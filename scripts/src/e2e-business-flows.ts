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
  bannerFor,
  parseEnvFromArgv,
  resolveSupabaseAdminClient,
  type DbEnv,
} from "./lib/db-env.js";

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

const DEFAULT_TENANT_ID = "926d29c2-4d77-4ab9-824b-f566725f9ae9";

const env = parseEnvFromArgv(process.argv);
const baseUrl = normalizeBaseUrl(
  process.env["E2E_BASE_URL"] ??
    (env === "production"
      ? "https://nxtdrive.io"
      : "https://staging.nxtdrive.io"),
);
const timeoutMs = Number(process.env["E2E_TIMEOUT_MS"] ?? "20000");
const headless = process.env["E2E_HEADLESS"] !== "0";
const tenantId =
  process.env["E2E_TENANT_ID"]?.trim() || DEFAULT_TENANT_ID;
const allowPaymentRedirect = process.env["E2E_ENABLE_PAYMENT_REDIRECT"] === "1";
const enableRisJourney = process.env["E2E_ENABLE_RIS_JOURNEY"] === "1";

const accounts: Account[] = [
  {
    label: "tenant admin",
    email:
      process.env["E2E_ADMIN_EMAIL"]?.trim() || "tenantadmin1@nxtdrive.io",
    password: process.env["E2E_ADMIN_PASSWORD"]?.trim() || "tenantadmin1",
    expectedPath: "/backoffice",
  },
  {
    label: "instructor",
    email:
      process.env["E2E_INSTRUCTOR_EMAIL"]?.trim() ||
      "instructeur1@nxtdrive.io",
    password:
      process.env["E2E_INSTRUCTOR_PASSWORD"]?.trim() || "instructeur1",
    expectedPath: "/instructeur",
  },
  {
    label: "student",
    email:
      process.env["E2E_STUDENT_EMAIL"]?.trim() || "leerling1@nxtdrive.io",
    password: process.env["E2E_STUDENT_PASSWORD"]?.trim() || "leerling1",
    expectedPath: "/leerling",
  },
];

const service = resolveSupabaseAdminClient(env);
const results: Result[] = [];
let failures = 0;

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
    await page.getByRole("button", { name: "Lesscore: 7" }).click();
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
): Promise<void> {
  const settings = await service
    .from("tenant_ris_settings")
    .select("lesson_card_mode, active_ris_version_id")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (
    settings.error ||
    settings.data?.lesson_card_mode !== "ris" ||
    !settings.data.active_ris_version_id
  ) {
    throw new Error(
      "E2E tenant must have RIS mode and an active validated catalog",
    );
  }

  const enrollment = await service
    .from("training_enrollments")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("student_id", studentId)
    .eq("training_method", "RIS_2_0")
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (enrollment.error || !enrollment.data?.id) {
    throw new Error(
      "E2E student needs an active RIS_2_0 enrollment; the suite never fabricates expert approval",
    );
  }

  const firstScript = await service
    .from("ris_scripts")
    .select("id, title")
    .eq("ris_version_id", settings.data.active_ris_version_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstScript.error || !firstScript.data?.id) {
    throw new Error("active RIS catalog has no script to assess");
  }

  const progressBefore = await service
    .from("student_ris_progress")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("student_id", studentId)
    .eq("script_id", firstScript.data.id)
    .maybeSingle();
  if (progressBefore.error) {
    throw new Error(`RIS progress snapshot failed: ${progressBefore.error.message}`);
  }
  risProgressSnapshots.push({
    tenantId: tenant.id,
    studentId,
    scriptId: firstScript.data.id as string,
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
  const learnerWish = `Ik wil ${firstScript.data.title as string} verder oefenen`;

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
    const slider = instructorPage
      .getByRole("slider", { name: /RIS-stap voor/i })
      .first();
    await slider.press("End");
    await poll(
      async () =>
        service
          .from("ris_script_assessments")
          .select(
            "id, lesson_card_id, concept_ris_step, concept_performance_outcome, concept_support_level, concept_safety_status",
          )
          .eq("tenant_id", tenant.id)
          .eq("script_id", firstScript.data!.id)
          .eq("lesson_id", lessonId)
          .maybeSingle(),
      (value) =>
        value.data?.concept_ris_step === "8" &&
        Boolean(value.data?.concept_performance_outcome) &&
        Boolean(value.data?.concept_support_level) &&
        Boolean(value.data?.concept_safety_status),
      "separated RIS observation",
    );

    await instructorPage
      .getByRole("tab", { name: "Reflectie", exact: true })
      .click();
    await instructorPage
      .getByRole("radio", { name: /Door leerling zelf/i })
      .check();
    await instructorPage.getByLabel("Reflectie in een zin").fill(reflectionText);
    await poll(
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

    await instructorPage
      .getByRole("tab", { name: /Samenvatting/ })
      .click();
    instructorPage.once("dialog", (dialog) => void dialog.accept());
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
      (value) => value.data?.publication_status === "waiting_for_student_response",
      "RIS publication",
    );
    const cardId = publishedCard.data?.id as string | undefined;
    if (!cardId) throw new Error("published RIS card id missing");

    const studentContext = await browser.newContext();
    const studentPage = await createPage(studentContext);
    try {
      await loginViaUi(studentPage, accounts[2]);
      await studentPage.goto(appUrl(`/leerling/lessen/${lessonId}`), {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await studentPage.getByText(reflectionText, { exact: true }).waitFor();
      await studentPage
        .getByText("Door leerling zelf", { exact: true })
        .waitFor();
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
    } finally {
      await studentContext.close();
    }

    await poll(
      async () =>
        service
          .from("ris_lesson_cards")
          .select("publication_status")
          .eq("id", cardId)
          .maybeSingle(),
      (value) => value.data?.publication_status === "fully_completed",
      "student response completion",
    );

    const nextLessonId = await createPlannedLessonForFlow(
      tenant,
      adminUserId,
      instructorId,
      studentId,
    );
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
    await studentPage
      .locator("p.whitespace-pre-wrap")
      .filter({ hasText: studentMessage })
      .first()
      .waitFor({ timeout: timeoutMs });

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

    await loginViaUi(instructorPage, instructorAccount);
    await instructorPage.goto(
      appUrl(
        `/instructeur/berichten?conversation=${encodeURIComponent(conversationId)}`,
      ),
      { waitUntil: "domcontentloaded", timeout: timeoutMs },
    );
    await instructorPage
      .locator("p.whitespace-pre-wrap")
      .filter({ hasText: studentMessage })
      .first()
      .waitFor({ timeout: timeoutMs });
    await instructorPage
      .getByPlaceholder("Typ een bericht...")
      .fill(instructorReply);
    await instructorPage.getByRole("button", { name: "Verzenden" }).click();
    await instructorPage
      .locator("p.whitespace-pre-wrap")
      .filter({ hasText: instructorReply })
      .first()
      .waitFor({ timeout: timeoutMs });

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

async function main(): Promise<void> {
  console.log(`${bannerFor(env)} - browser business-flow E2E`);
  console.log(`Target: ${baseUrl}`);
  console.log("");

  const tenant = await lookupTenant();
  const adminUserId = await lookupUserIdByEmail(accounts[0].email);
  const instructorUserId = await lookupUserIdByEmail(accounts[1].email);
  const student = await lookupStudentByUserEmail(tenant, accounts[2].email);

  const browser = await createBrowser();
  try {
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

    if (enableRisJourney) {
      await expect(
        "RIS instructor assessment -> self-reflection -> publication -> student response -> next focus",
        async () => {
          await verifyRisInstructorToStudentJourney(
            browser,
            tenant,
            adminUserId,
            instructorUserId,
            student.id,
          );
        },
      );
    } else {
      record(
        "SKIP",
        "RIS instructor-to-student journey",
        "set E2E_ENABLE_RIS_JOURNEY=1 on a validated RIS test tenant",
      );
    }

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
  } finally {
    await browser.close();
    await cleanupMessagesAndConversations();
    await cleanupInvoices();
    await cleanupLessons();
    await cleanupStudents();
    await cleanupLeadArtifacts();
    await cleanupMembershipsAndUsers();
    await cleanupBranches();
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} business-flow E2E check(s) failed.`);
    process.exit(1);
  }
  console.log("Business-flow E2E checks passed.");
}

main().catch((error) => {
  record(
    "FAIL",
    "business-flow suite",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exit(1);
});
