import assert from "node:assert/strict";

import { chromium, request } from "playwright";

const baseUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:22557").replace(
  /\/+$/,
  "",
);

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
} finally {
  await browser.close();
}

console.log("Release E2E smoke passed.");
