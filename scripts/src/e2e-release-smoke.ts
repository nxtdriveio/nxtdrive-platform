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
      document.querySelectorAll<HTMLElement>(
        "main a, main button, main input, [data-notification-panel], [role=dialog]",
      ),
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
    "/visual-fixtures/instructeur/berichten/thread-1",
    "/visual-fixtures/instructeur/meer",
    "/visual-fixtures/leerling/meer",
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
  await assertNoViewportClipping(
    page,
    "mobile instructor notification overlay at 390x844",
  );

  await page.goto(`${baseUrl}/visual-fixtures/instructeur/berichten/thread-1`, {
    waitUntil: "networkidle",
  });
  const chatLayout = await page.evaluate(() => {
    const thread = document.querySelector<HTMLElement>("[data-chat-thread]");
    const messages = document.querySelector<HTMLElement>(
      "[data-chat-messages]",
    );
    const composer = document.querySelector<HTMLElement>(
      "[data-chat-composer]",
    );
    const bottomNav = document.querySelector<HTMLElement>(
      'nav[aria-label="Mobiele instructeurnavigatie"]',
    );
    if (!thread || !messages || !composer || !bottomNav) return null;
    const threadRect = thread.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const bottomNavRect = bottomNav.getBoundingClientRect();
    return {
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      chatBottom: threadRect.bottom,
      composerBottom: composerRect.bottom,
      bottomNavTop: bottomNavRect.top,
      messageOverflowY: getComputedStyle(messages).overflowY,
      messagesScrollHeight: messages.scrollHeight,
      messagesClientHeight: messages.clientHeight,
      onlineLabels: Array.from(document.querySelectorAll("p, span")).filter(
        (element) => element.textContent?.trim() === "Online",
      ).length,
    };
  });
  assert.ok(chatLayout, "mobile instructor chat layout must render");
  assert.equal(
    chatLayout.documentScrollHeight <= chatLayout.viewportHeight + 1,
    true,
    "mobile instructor chat page itself must not scroll",
  );
  assert.equal(
    chatLayout.bottomNavTop - chatLayout.chatBottom >= 8,
    true,
    "mobile chat container must keep space above the bottom navigation",
  );
  assert.equal(
    Math.abs(chatLayout.chatBottom - chatLayout.composerBottom) <= 1,
    true,
    "message composer must sit at the bottom of the white chat container",
  );
  assert.equal(
    chatLayout.messageOverflowY === "auto" ||
      chatLayout.messageOverflowY === "scroll",
    true,
    "conversation must use inline vertical scrolling",
  );
  assert.equal(
    chatLayout.messagesScrollHeight > chatLayout.messagesClientHeight,
    true,
    "long conversations must overflow inside the messages region",
  );
  assert.equal(
    chatLayout.onlineLabels,
    0,
    "chat must not claim a learner is online without presence data",
  );
  await page.getByRole("link", { name: "Terug naar gesprekken" }).click();
  await page.waitForURL(`${baseUrl}/visual-fixtures/instructeur/berichten`);
  await page.getByRole("heading", { name: "Berichten" }).waitFor();

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
  await page.getByRole("link", { name: "Week", exact: true }).click();
  await page.waitForURL(/weergave=week/);
  assert.equal(
    await page
      .getByRole("link", { name: "Week", exact: true })
      .getAttribute("aria-current"),
    "page",
    "week must be a functional agenda view",
  );
  await page.getByRole("link", { name: "Maand", exact: true }).click();
  await page.waitForURL(/weergave=month/);
  assert.equal(
    await page
      .getByRole("link", { name: "Maand", exact: true })
      .getAttribute("aria-current"),
    "page",
    "month must be a functional agenda view",
  );
  await page.getByRole("link", { name: "Rijleshistorie" }).click();
  await page.waitForURL(/weergave=history/);
  assert.match(
    (await page
      .getByRole("link", { name: "Open lesdetails en evaluatie" })
      .first()
      .getAttribute("href")) ?? "",
    /^\/instructeur\/lessen\//,
    "history must link a lesson to its canonical evaluation workspace",
  );
  await page.getByRole("link", { name: "Terug naar vandaag" }).click();
  await page.waitForURL(/weergave=day/);
  const appointmentSelection = page.locator("[data-calendar-event]").first();
  await appointmentSelection.click();
  await page.locator("[data-appointment-quick-view]").waitFor();
  assert.match(
    (await page
      .getByRole("link", {
        name: /(Start les|Bekijken \/ wijzigen|Bekijken)/,
      })
      .first()
      .getAttribute("href")) ?? "",
    /^\/instructeur\/(lessen|agenda)\//,
  );
  await page.keyboard.press("Escape");

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

  await page.goto(`${baseUrl}/visual-fixtures/leerling/meer`, {
    waitUntil: "networkidle",
  });
  const learnerNav = page.locator('nav[aria-label="Hoofdnavigatie"]');
  assert.equal(
    await learnerNav.locator("a").count(),
    5,
    "learner bottom navigation must expose exactly five primary actions",
  );
  await learnerNav.getByRole("link", { name: "Meer", exact: true }).waitFor();
  for (const destination of [
    "/leerling/account",
    "/leerling/berichten",
    "/leerling/hulp",
    "/leerling/documenten",
    "/leerling/instellingen",
  ]) {
    assert.equal(
      await page.locator(`main a[href="${destination}"]`).count(),
      1,
      `Meer must expose one visible standalone destination for ${destination}`,
    );
  }
} finally {
  await browser.close();
}

console.log("Release E2E smoke passed.");
