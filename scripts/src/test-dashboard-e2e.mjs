/**
 * End-to-end test for the NXTDRIVE backoffice dashboard.
 * Run with: node scripts/src/test-dashboard-e2e.mjs
 *
 * Tests:
 * 1. Login as dev-school (tenant_admin) → redirect to /backoffice
 * 2. All 7 KPI cards visible
 * 3. All 7 section cards visible
 * 4. Lead funnel renders with real data (seeded lead → "Nieuw" stage visible with count > 0)
 * 5. Mobile drawer: opens, closes via nav-link click (auto-close on navigation)
 * 6. Dark mode toggle: data-theme flips AND computed background color changes (CSS vars, not hard-coded)
 * 7. StatusBadge renders Dutch labels (not raw status strings)
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "http://localhost:80";
const EMAIL = "dev-school@demo.nxtdrive.io";
const PASSWORD = "NxtDev2024!";

// Service-role client for test setup/teardown
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
    failures.push(label);
  }
}

async function assertVisible(page, selector, label) {
  try {
    const el = page.locator(selector).first();
    const visible = await el.isVisible({ timeout: 5000 });
    assert(visible, label);
    return visible;
  } catch {
    assert(false, label + " [timeout]");
    return false;
  }
}

async function assertTextVisible(page, text, label) {
  try {
    const el = page.getByText(text, { exact: false }).first();
    const visible = await el.isVisible({ timeout: 5000 });
    assert(visible, label);
    return visible;
  } catch {
    assert(false, label + " [timeout]");
    return false;
  }
}

// ── Test setup: seed a lead so the funnel has pipeline data ──────────────────
let seededLeadId = null;

async function seedTestLead() {
  // Resolve demo-academy tenant — hard failure if unavailable
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "demo-academy")
    .single();

  if (tenantErr || !tenant) {
    throw new Error(`[setup] Could not find demo-academy tenant: ${tenantErr?.message}`);
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      tenant_id: tenant.id,
      full_name: "E2E Test Lead",
      email: "e2e-test-lead@test.nxtdrive.io",
      source: "website",
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[setup] Could not seed lead: ${error.message}`);
  }

  seededLeadId = lead.id;
  console.log(`  [setup] Seeded lead ${seededLeadId.slice(0, 8)} with status=new`);
}

async function cleanupTestLead() {
  if (!seededLeadId) return;
  await supabase.from("leads").delete().eq("id", seededLeadId);
  console.log(`  [teardown] Removed seeded lead ${seededLeadId.slice(0, 8)}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  await seedTestLead();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    // ── Test 1: Login and dashboard loads ──────────────────────────────────
    console.log("\n── Test 1: Login and dashboard loads ──");

    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { timeout: 15000 });
    await assertTextVisible(page, "Inloggen", "Login page shows 'Inloggen' heading");

    await page.fill('input[id="email"]', EMAIL);
    await page.fill('input[id="password"]', PASSWORD);
    // Target the "Inloggen" submit button — DevLoginPanel also has submit buttons
    await page.click('button[type="submit"]:has-text("Inloggen")');

    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
    const finalUrl = page.url();
    console.log(`    Redirected to: ${finalUrl}`);
    assert(finalUrl.includes("/backoffice"), `Redirected to /backoffice after login (got: ${finalUrl})`);

    await assertTextVisible(page, "Dashboard", "Dashboard heading visible");
    await assertTextVisible(page, "NXTDRIVE Demo Academy", "Tenant name badge visible");
    await assertTextVisible(page, "Nieuwe aanvraag", "'+ Nieuwe aanvraag' button visible");

    // ── Test 2: All 7 KPI stat cards ──────────────────────────────────────
    console.log("\n── Test 2: All 7 KPI stat cards ──");

    const kpiLabels = [
      "Actieve leerlingen",
      "Lessen vandaag",
      "Openstaande leads",
      "Omzet deze maand",
      "Nog opvolgen",
      "Open facturen",
      "Proefles geboekt",
    ];
    for (const label of kpiLabels) {
      await assertTextVisible(page, label, `KPI card: "${label}"`);
    }

    const refreshBtn = page.locator('[aria-label="Nu vernieuwen"]').first();
    assert(await refreshBtn.isVisible({ timeout: 3000 }), "KPI refresh button present");

    // ── Test 3: All 7 dashboard section cards ─────────────────────────────
    console.log("\n── Test 3: All 7 dashboard section cards ──");

    const cardHeaders = [
      "Leadfunnel",
      "Agenda vandaag",
      "Openstaande taken",
      "Eerstvolgende proeflessen",
      "Leerlingen voortgang",
      "Omzet samenvatting",
      "Slimme meldingen",
    ];
    for (const header of cardHeaders) {
      await assertTextVisible(page, header, `Dashboard card: "${header}"`);
    }

    // ── Test 4: Lead funnel renders with seeded pipeline data ─────────────
    console.log("\n── Test 4: Lead funnel renders with seeded data ──");

    // Reload so the server-rendered funnel reflects the seeded lead
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // "Nieuw" stage must be visible as a label
    const nieuwVisible = await page.getByText("Nieuw", { exact: true }).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    assert(nieuwVisible, "Lead funnel shows 'Nieuw' stage label");

    // At least one count > 0 should appear (e.g. "1" next to Nieuw stage)
    const funnelCard = page.locator("text=Leadfunnel").locator("..").locator("..");
    const funnelHtml = await funnelCard.innerHTML({ timeout: 3000 }).catch(() => "");
    const hasCount = />[1-9][0-9]*</.test(funnelHtml);
    assert(hasCount, "Lead funnel shows at least one non-zero stage count");

    // Empty state message must NOT appear when we have a lead
    const emptyVisible = await page.getByText("Nog geen leads in de funnel.", { exact: false })
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    assert(!emptyVisible, "Lead funnel does not show empty state when pipeline has data");

    // ── Test 5: Mobile drawer opens and closes via nav-link navigation ────
    console.log("\n── Test 5: Mobile drawer — open, then close via nav-link ──");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const hamburger = page.locator('[aria-label="Navigatie openen"]');
    assert(await hamburger.isVisible({ timeout: 5000 }), "Hamburger button visible on mobile");

    await hamburger.click();
    await page.waitForTimeout(400);

    const drawer = page.locator('[role="dialog"]');
    assert(await drawer.isVisible({ timeout: 3000 }), "Mobile drawer opens (role=dialog visible)");

    // Verify close button also present
    const closeBtn = page.locator('[aria-label="Navigatie sluiten"]');
    assert(await closeBtn.isVisible({ timeout: 3000 }), "Close button visible inside drawer");

    // Click a sidebar nav link (Leerlingen) — pathname change triggers useEffect → drawer closes
    const leerlingenLink = drawer.locator('a[href="/backoffice/leerlingen"]').first();
    assert(await leerlingenLink.isVisible({ timeout: 3000 }), "Leerlingen nav link visible in drawer");
    await leerlingenLink.click();

    // Wait for URL to change to /backoffice/leerlingen
    await page.waitForURL((url) => url.pathname.includes("/leerlingen"), { timeout: 8000 });
    console.log(`    Navigated to: ${page.url()}`);
    assert(page.url().includes("/leerlingen"), "Navigated to /backoffice/leerlingen after clicking nav link");

    // After navigation, drawer must be gone (DashboardShell useEffect on pathname)
    await page.waitForTimeout(400);
    const drawerAfterNav = await drawer.isVisible({ timeout: 2000 }).catch(() => false);
    assert(!drawerAfterNav, "Mobile drawer auto-closes after navigation (useEffect on pathname)");

    // ── Test 6: Dark mode toggle — theme flips AND computed bg changes ────
    console.log("\n── Test 6: Dark mode toggle — theme + computed colors ──");

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE_URL}/backoffice`, { timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(600);

    const themeBefore = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    // Capture computed background on <body> before toggle — body carries the theme bg color
    const bgBefore = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );
    console.log(`    data-theme before: ${themeBefore}  bg: ${bgBefore}`);

    const toggleBtn = page.locator('[aria-label*="Schakel naar"]');
    assert(await toggleBtn.isVisible({ timeout: 5000 }), "Theme toggle button is present");

    await toggleBtn.click();
    await page.waitForTimeout(900);

    const themeAfter = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    const bgAfter = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );
    console.log(`    data-theme after: ${themeAfter}  bg: ${bgAfter}`);

    assert(themeBefore !== themeAfter, `Theme attribute flipped: ${themeBefore} → ${themeAfter}`);

    // The computed background color must change — proves CSS vars are active (not hard-coded)
    assert(bgBefore !== bgAfter, `Computed background-color changed with theme (CSS variables active, not hard-coded): ${bgBefore} → ${bgAfter}`);

    // Verify no hard-coded inline color styles on dashboard elements
    const inlineColorCount = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("[style]"));
      return all.filter((el) => {
        const s = el.getAttribute("style") ?? "";
        // Flag inline background or color set to a hex/rgb literal (not a var())
        return /(background|color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\(|rgba\()/.test(s)
          && !s.includes("var(");
      }).length;
    });
    assert(
      inlineColorCount === 0,
      `No hard-coded inline color/background styles on rendered elements (found ${inlineColorCount})`
    );

    // Verify computed styles on key dashboard surfaces actually changed with the theme toggle.
    // This confirms Tailwind CSS variables (bg-background, bg-card) are active throughout
    // the UI — not hard-coded values that would look identical regardless of theme.
    const surfaceColorsBefore = await page.evaluate(() => {
      // Sample the first card element and first KPI number text
      const card = document.querySelector(".bg-card, [class*='card']");
      const kpiNum = document.querySelector("[class*='text-2xl'], [class*='font-bold']");
      return {
        card: card ? window.getComputedStyle(card).backgroundColor : null,
        kpiText: kpiNum ? window.getComputedStyle(kpiNum).color : null,
      };
    });

    // Toggle back to original theme so we can compare both directions
    await toggleBtn.click();
    await page.waitForTimeout(900);

    const surfaceColorsAfter = await page.evaluate(() => {
      const card = document.querySelector(".bg-card, [class*='card']");
      const kpiNum = document.querySelector("[class*='text-2xl'], [class*='font-bold']");
      return {
        card: card ? window.getComputedStyle(card).backgroundColor : null,
        kpiText: kpiNum ? window.getComputedStyle(kpiNum).color : null,
      };
    });
    console.log(`    card bg: ${surfaceColorsBefore.card} → ${surfaceColorsAfter.card}`);
    console.log(`    kpi text: ${surfaceColorsBefore.kpiText} → ${surfaceColorsAfter.kpiText}`);

    const cardBgChanged = surfaceColorsBefore.card !== null
      && surfaceColorsAfter.card !== null
      && surfaceColorsBefore.card !== surfaceColorsAfter.card;
    assert(
      cardBgChanged,
      `Card surface background-color changes with theme toggle (CSS vars active on .bg-card): ${surfaceColorsBefore.card} → ${surfaceColorsAfter.card}`
    );

    await assertTextVisible(page, "Dashboard", "Dashboard heading still visible after theme switch");
    await assertTextVisible(page, "Actieve leerlingen", "KPI card still visible after theme switch");

    // ── Test 7: StatusBadge renders Dutch labels ──────────────────────────
    console.log("\n── Test 7: StatusBadge renders Dutch labels ──");

    const rawStatuses = ["planned", "completed", "in_progress", "provisional", "confirmed"];
    let rawFound = false;

    const agendaCard = page.locator("text=Agenda vandaag").locator("..").locator("..");
    const agendaHtml = await agendaCard.innerHTML({ timeout: 3000 }).catch(() => "");

    for (const raw of rawStatuses) {
      if (agendaHtml.includes(`>${raw}<`) || agendaHtml.includes(`> ${raw} <`)) {
        rawFound = true;
        console.error(`    Found raw status "${raw}" in Agenda vandaag card`);
      }
    }
    assert(!rawFound, "No raw English status strings in badge text (Dutch labels used)");

    const dutchBadgeWords = ["Gepland", "Bezig", "Gereed", "Geannuleerd", "Voorlopig", "Bevestigd"];
    const pageText = await page.textContent("body", { timeout: 3000 });
    const hasDutchBadge = dutchBadgeWords.some((w) => pageText?.includes(w));
    const agendaEmpty = pageText?.includes("Geen lessen gepland voor vandaag") || false;
    const trialsEmpty = pageText?.includes("Geen proeflessen gepland") || false;
    if (agendaEmpty && trialsEmpty) {
      assert(true, "Status badge check skipped — both agenda and trial cards in empty state");
    } else {
      assert(hasDutchBadge, "Dutch status badge labels found (e.g. Gepland, Voorlopig, Bevestigd)");
    }

  } catch (err) {
    console.error("\nUnexpected error:", err.message);
    failed++;
    failures.push("Unexpected error: " + err.message);
  } finally {
    await browser.close();
    await cleanupTestLead();
  }

  // Summary
  console.log("\n══════════════════════════════════════");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log("══════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
