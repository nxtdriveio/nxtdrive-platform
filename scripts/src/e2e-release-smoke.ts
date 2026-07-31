import assert from "node:assert/strict";

import { chromium, request } from "playwright";

const baseUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:22557").replace(
  /\/+$/,
  "",
);

const requiredViewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1440, height: 1000 },
] as const;

async function assertNoViewportClipping(
  page: import("playwright").Page,
  label: string,
) {
  const result = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const visibleOffenders = Array.from(
      document.querySelectorAll<HTMLElement>("main a, main button, main input"),
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1)
        );
      })
      .map((element) => ({
        tag: element.tagName,
        text: (element.getAttribute("aria-label") ?? element.innerText).trim(),
      }))
      .slice(0, 5);
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
      visibleOffenders,
    };
  });
  assert.equal(
    result.documentWidth <= result.viewportWidth,
    true,
    `${label} has horizontal document overflow (${result.documentWidth} > ${result.viewportWidth})`,
  );
  assert.deepEqual(
    result.visibleOffenders,
    [],
    `${label} has clipped visible actions`,
  );
}

async function assertVisibleActions(
  page: import("playwright").Page,
  label: string,
) {
  const result = await page.evaluate(() => {
    const invalidLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("main a"),
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .filter((link) => {
        const href = link.getAttribute("href")?.trim() ?? "";
        return href === "" || href === "#" || href.startsWith("javascript:");
      })
      .map((link) => link.innerText.trim());
    const unnamedButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .filter(
        (button) =>
          !(
            button.getAttribute("aria-label")?.trim() ||
            button.getAttribute("title")?.trim() ||
            button.innerText.trim()
          ),
      ).length;
    return { invalidLinks, unnamedButtons };
  });
  assert.deepEqual(result.invalidLinks, [], `${label} has inert visible links`);
  assert.equal(
    result.unnamedButtons,
    0,
    `${label} has visible buttons without an actionable name`,
  );
}

const api = await request.newContext({ baseURL: baseUrl });
try {
  const live = await api.get("/health/live");
  assert.equal(live.status(), 200);

  const assetLinks = await api.get("/.well-known/assetlinks.json");
  assert.equal(assetLinks.status(), 200);
  assert.equal(
    (await assetLinks.text()).includes("REPLACE_WITH"),
    false,
    "Digital Asset Links must never expose placeholder fingerprints",
  );

  const learnerManifest = await api.get("/leerling/manifest.webmanifest");
  assert.equal(learnerManifest.status(), 200);
  const manifest = await learnerManifest.json();
  assert.equal(manifest.start_url, "/leerling");
  assert.equal(manifest.scope, "/leerling");
  assert.equal(manifest.orientation, undefined);

  const learnerAlias = await api.get("/student/lessons/lesson-42?tab=focus", {
    maxRedirects: 0,
  });
  assert.equal(learnerAlias.status(), 308);
  assert.equal(
    new URL(learnerAlias.headers()["location"]).pathname +
      new URL(learnerAlias.headers()["location"]).search,
    "/leerling/lessen/lesson-42?tab=focus",
  );

  const instructorAlias = await api.get(
    "/instructor/messages/thread-42?tab=ongelezen",
    { maxRedirects: 0 },
  );
  assert.equal(instructorAlias.status(), 308);
  assert.equal(
    new URL(instructorAlias.headers()["location"]).pathname +
      new URL(instructorAlias.headers()["location"]).search,
    "/instructeur/berichten/thread-42?tab=ongelezen",
  );
} finally {
  await api.dispose();
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
  });
  const response = await page.goto(`${baseUrl}/login`, {
    waitUntil: "networkidle",
  });
  assert.equal(response?.status(), 200);
  await page.getByRole("heading", { name: "Inloggen" }).waitFor();
  await page.getByLabel("E-mailadres").fill("instructeur@example.test");
  await page.getByLabel("Wachtwoord").fill("niet-ingevuld");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate<boolean>(
      "document.documentElement.scrollWidth <= window.innerWidth",
    ),
    true,
    "Login may not overflow a portrait phone viewport",
  );

  for (const path of ["/privacy", "/account-verwijderen", "/beveiliging"]) {
    const publicResponse = await page.goto(`${baseUrl}${path}`, {
      waitUntil: "networkidle",
    });
    assert.equal(publicResponse?.status(), 200, `${path} must be public`);
    assert.equal(
      await page.evaluate<boolean>(
        "document.documentElement.scrollWidth <= window.innerWidth",
      ),
      true,
      `${path} may not overflow a portrait phone viewport`,
    );
  }

  const fixtureRoutes = [
    "/visual-fixtures/instructeur",
    "/visual-fixtures/instructeur/agenda",
    "/visual-fixtures/instructeur/leerlingen",
    "/visual-fixtures/instructeur/meer",
  ];
  for (const viewport of requiredViewports) {
    await page.setViewportSize(viewport);
    for (const path of fixtureRoutes) {
      const fixtureResponse = await page.goto(`${baseUrl}${path}`, {
        waitUntil: "networkidle",
      });
      assert.equal(
        fixtureResponse?.status(),
        200,
        `${path} must be available to the release fixture gate`,
      );
      const label = `${path} at ${viewport.width}x${viewport.height}`;
      await assertNoViewportClipping(page, label);
      await assertVisibleActions(page, label);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/visual-fixtures/instructeur`, {
    waitUntil: "networkidle",
  });
  assert.equal(
    await page
      .locator('nav[aria-label="Mobiele instructeurnavigatie"] a')
      .count(),
    5,
    "mobile instructor navigation must expose exactly five primary actions",
  );
  await page.getByRole("button", { name: "Meldingen" }).click();
  await page.getByRole("link", { name: "Bekijk alles" }).waitFor();
  await page.getByRole("link", { name: "Account en instellingen" }).waitFor();

  await page.goto(`${baseUrl}/visual-fixtures/instructeur/meer`, {
    waitUntil: "networkidle",
  });
  const logout = page.getByRole("button", { name: "Uitloggen" });
  await logout.waitFor();
  assert.equal(
    await logout.evaluate(
      (button) =>
        button.closest("form")?.getAttribute("action") === "/auth/logout",
    ),
    true,
    "mobile logout must submit to the canonical logout endpoint",
  );

  await page.goto(`${baseUrl}/visual-fixtures/instructeur/agenda`, {
    waitUntil: "networkidle",
  });
  const appointmentSelection = page.locator('a[href*="?afspraak="]').first();
  const appointmentDestination =
    await appointmentSelection.getAttribute("href");
  assert.match(
    appointmentDestination ?? "",
    /^\/visual-fixtures\/instructeur\/agenda\?afspraak=.+/,
  );
  await appointmentSelection.click();
  await page.getByRole("heading", { name: "Afspraakdetails" }).waitFor();
  assert.match(page.url(), /[?&]afspraak=/);
  assert.match(
    (await page
      .getByRole("link", { name: /Open volledige afspraak/ })
      .getAttribute("href")) ?? "",
    /^\/instructeur\/(lessen|agenda)\//,
  );

  await page.goto(`${baseUrl}/visual-fixtures/instructeur/leerlingen`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Leerling toevoegen" }).click();
  await page
    .getByRole("dialog", { name: "Leerling direct toevoegen" })
    .waitFor();
  await page.getByRole("button", { name: "Annuleren" }).click();
  const studentSelection = page.locator('a[href*="?leerling="]').first();
  assert.match(
    (await studentSelection.getAttribute("href")) ?? "",
    /^\/visual-fixtures\/instructeur\/leerlingen\?leerling=.+/,
  );
  await studentSelection.click();
  await page.getByRole("link", { name: "Open volledig dossier" }).waitFor();
  assert.match(page.url(), /[?&]leerling=/);
} finally {
  await browser.close();
}

console.log("Release E2E smoke passed.");
