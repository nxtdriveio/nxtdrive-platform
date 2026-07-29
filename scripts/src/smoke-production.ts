/**
 * Production/staging smoke flow runner.
 *
 * Examples:
 *   SMOKE_BASE_URL=https://nxtdrive.io pnpm --filter @workspace/scripts run smoke:production
 *   SMOKE_BASE_URL=https://nxtdrive.io SMOKE_STUDENT_EMAIL=... SMOKE_STUDENT_PASSWORD=... pnpm --filter @workspace/scripts run smoke:production
 */
import { chromium, type Browser, type Page } from "playwright";

type SmokeResult = "OK" | "SKIP" | "FAIL";
type BrowserMode = "required" | "off";

const baseUrl = normalizeBaseUrl(
  process.env["SMOKE_BASE_URL"] ?? "http://127.0.0.1:5001",
);
const timeoutMs = Number(process.env["SMOKE_TIMEOUT_MS"] ?? "15000");
const allowDegradedReady = process.env["SMOKE_ALLOW_DEGRADED_READY"] === "1";
const tenantHost = normalizeOptionalUrl(process.env["SMOKE_TENANT_HOST"]);
const customDomainHost = normalizeOptionalUrl(
  process.env["SMOKE_CUSTOM_DOMAIN_HOST"],
);
const browserMode = normalizeBrowserMode(process.env["SMOKE_BROWSER_MODE"]);

const studentEmail = process.env["SMOKE_STUDENT_EMAIL"];
const studentPassword = process.env["SMOKE_STUDENT_PASSWORD"];
const instructorEmail = process.env["SMOKE_INSTRUCTOR_EMAIL"];
const instructorPassword = process.env["SMOKE_INSTRUCTOR_PASSWORD"];

let failures = 0;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeOptionalUrl(value: string | undefined): string | null {
  if (!value) return null;
  return normalizeBaseUrl(value);
}

function normalizeBrowserMode(value: string | undefined): BrowserMode {
  if ((value ?? "").toLowerCase() === "off") return "off";
  return "required";
}

function url(path: string): string {
  return `${baseUrl}${path}`;
}

function record(status: SmokeResult, name: string, detail?: string): void {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
  if (status === "FAIL") failures++;
}

async function checkJsonEndpoint(
  path: string,
  expectedStatus = 200,
): Promise<void> {
  const startedAt = Date.now();
  const response = await fetch(url(path), {
    headers: {
      Accept: "application/json",
      "User-Agent": "nxtdrive-smoke/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const latency = `${Date.now() - startedAt}ms`;

  if (response.status !== expectedStatus) {
    record(
      "FAIL",
      `GET ${path}`,
      `expected ${expectedStatus}, got ${response.status}`,
    );
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    record(
      "FAIL",
      `GET ${path}`,
      `unexpected content-type ${contentType || "empty"}`,
    );
    return;
  }

  record("OK", `GET ${path}`, latency);
}

async function checkReadinessEndpoint(): Promise<void> {
  const startedAt = Date.now();
  const response = await fetch(url("/api/health/ready"), {
    headers: {
      Accept: "application/json",
      "User-Agent": "nxtdrive-smoke/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const latency = `${Date.now() - startedAt}ms`;

  if (response.status === 200) {
    record("OK", "GET /api/health/ready", latency);
    return;
  }

  if (allowDegradedReady && response.status === 503) {
    record(
      "SKIP",
      "GET /api/health/ready",
      "degraded allowed for local/non-production smoke",
    );
    return;
  }

  let body = "";
  try {
    body = JSON.stringify(await response.json());
  } catch {
    body = await response.text();
  }

  record(
    "FAIL",
    "GET /api/health/ready",
    `expected 200, got ${response.status}: ${body.slice(0, 500)}`,
  );
}

async function checkManifest(path: string): Promise<void> {
  const response = await fetch(url(path), {
    headers: {
      Accept: "application/manifest+json, application/json",
      "User-Agent": "nxtdrive-smoke/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status !== 200) {
    record("FAIL", `GET ${path}`, `expected 200, got ${response.status}`);
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("manifest")) {
    record(
      "FAIL",
      `GET ${path}`,
      `unexpected content-type ${contentType || "empty"}`,
    );
    return;
  }

  const manifest = (await response.json()) as {
    name?: string;
    start_url?: string;
  };
  if (!manifest.name || !manifest.start_url) {
    record("FAIL", `GET ${path}`, "manifest missing name or start_url");
    return;
  }

  record("OK", `GET ${path}`, manifest.name);
}

async function checkLoginPage(page: Page): Promise<void> {
  await page.goto(url("/login"), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });

  const email = page
    .locator('input[type="email"], input[name="email"]')
    .first();
  const password = page
    .locator('input[type="password"], input[name="password"]')
    .first();

  if ((await email.count()) === 0 || (await password.count()) === 0) {
    record("FAIL", "GET /login browser", "email/password fields not found");
    return;
  }

  record("OK", "GET /login browser", "login form rendered");
}

async function checkLoginPageHttp(
  path: string,
  label: string,
  base = baseUrl,
): Promise<void> {
  const response = await fetch(`${base}${path}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": "nxtdrive-smoke/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status !== 200) {
    record("FAIL", label, `expected 200, got ${response.status}`);
    return;
  }

  const body = await response.text();
  if (!body.includes('type="email"') || !body.includes('type="password"')) {
    record("FAIL", label, "email/password fields not found in html");
    return;
  }

  record("OK", label, `${base}${path}`);
}

async function checkHostedLoginPage(
  browser: Browser,
  label: string,
  targetBaseUrl: string | null,
): Promise<void> {
  if (!targetBaseUrl) {
    record("SKIP", label, "host not configured");
    return;
  }

  const page = await browser.newPage();

  try {
    await page.goto(`${targetBaseUrl}/login`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const email = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    const password = page
      .locator('input[type="password"], input[name="password"]')
      .first();

    if ((await email.count()) === 0 || (await password.count()) === 0) {
      record("FAIL", label, "email/password fields not found");
      return;
    }

    record("OK", label, `${targetBaseUrl}/login`);
  } catch (error) {
    record(
      "FAIL",
      label,
      error instanceof Error ? error.message : "unknown error",
    );
  } finally {
    await page.close();
  }
}

async function checkHostedLoginPageHttp(
  label: string,
  targetBaseUrl: string | null,
): Promise<void> {
  if (!targetBaseUrl) {
    record("SKIP", label, "host not configured");
    return;
  }

  await checkLoginPageHttp("/login", label, targetBaseUrl);
}

async function checkLoginFlow(
  browser: Browser,
  label: "student" | "instructor",
  email?: string,
  password?: string,
): Promise<void> {
  if (!email || !password) {
    record(
      "SKIP",
      `${label} login`,
      `set SMOKE_${label.toUpperCase()}_EMAIL and SMOKE_${label.toUpperCase()}_PASSWORD`,
    );
    return;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  const expectedPath = label === "student" ? "/leerling" : "/instructeur";

  try {
    await page.goto(url("/login"), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .fill(email);
    await page
      .locator('input[type="password"], input[name="password"]')
      .first()
      .fill(password);
    await page
      .getByRole("button", { name: /inloggen|login/i })
      .first()
      .click();

    await page.waitForURL(
      (currentUrl) => currentUrl.pathname.startsWith(expectedPath),
      {
        timeout: timeoutMs,
      },
    );

    record("OK", `${label} login`, page.url());
  } catch (error) {
    record(
      "FAIL",
      `${label} login`,
      error instanceof Error ? error.message : "unknown error",
    );
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  console.log(`NXTDRIVE smoke target: ${baseUrl}`);
  console.log("");

  await checkJsonEndpoint("/api/health");
  await checkReadinessEndpoint();
  await checkManifest("/manifest.webmanifest");
  await checkManifest("/leerling/manifest.webmanifest");
  await checkManifest("/instructeur/manifest.webmanifest");

  if (browserMode === "off") {
    await checkLoginPageHttp("/login", "GET /login html shell");
    await checkHostedLoginPageHttp("tenant host login shell", tenantHost);
    await checkHostedLoginPageHttp(
      "custom domain login shell",
      customDomainHost,
    );
    record("SKIP", "student login", "browser mode off");
    record("SKIP", "instructor login", "browser mode off");
  } else {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await checkLoginPage(page);
      await page.close();

      await checkHostedLoginPage(
        browser,
        "tenant host login shell",
        tenantHost,
      );
      await checkHostedLoginPage(
        browser,
        "custom domain login shell",
        customDomainHost,
      );
      await checkLoginFlow(browser, "student", studentEmail, studentPassword);
      await checkLoginFlow(
        browser,
        "instructor",
        instructorEmail,
        instructorPassword,
      );
    } finally {
      await browser.close();
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} smoke check(s) failed.`);
    process.exit(1);
  }

  console.log("Production smoke checks passed.");
}

main().catch((error) => {
  record(
    "FAIL",
    "smoke runner",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exit(1);
});
