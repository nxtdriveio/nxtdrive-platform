import assert from "node:assert/strict";
import { chromium, type Locator, type Page } from "playwright";

const baseUrl = (
  process.env["NXTDRIVE_E2E_BASE_URL"] ?? "http://127.0.0.1:22557"
).replace(/\/+$/, "");

async function assertViewportContract(page: Page) {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(
      "[data-instructor-shell]",
    );
    const main = document.querySelector<HTMLElement>("main");
    const calendar = document.querySelector<HTMLElement>(
      "[data-instructor-day-calendar]",
    );
    const scroller = document.querySelector<HTMLElement>(
      "[data-calendar-scroll-viewport]",
    );
    if (!shell || !main || !calendar || !scroller) return null;
    return {
      viewportHeight: window.innerHeight,
      bodyScrollHeight: document.body.scrollHeight,
      shellHeight: shell.getBoundingClientRect().height,
      mainOverflowY: getComputedStyle(main).overflowY,
      calendarBottom: calendar.getBoundingClientRect().bottom,
      scrollerClientHeight: scroller.clientHeight,
      scrollerScrollHeight: scroller.scrollHeight,
      horizontalOverflow:
        document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  assert.ok(metrics, "calendar viewport metrics must exist");
  assert.ok(Math.abs(metrics.shellHeight - metrics.viewportHeight) <= 1);
  assert.equal(metrics.mainOverflowY, "hidden");
  assert.ok(metrics.calendarBottom <= metrics.viewportHeight + 1);
  assert.ok(metrics.scrollerScrollHeight > metrics.scrollerClientHeight);
  assert.ok(metrics.horizontalOverflow <= 0);
}

async function openWizard(page: Page, time: string): Promise<Locator> {
  const slot = page.getByRole("gridcell", {
    name: new RegExp(`Nieuwe afspraak toevoegen, dinsdag 11 augustus, ${time}`),
  });
  await slot.scrollIntoViewIfNeeded();
  await slot.click();
  const dialog = page.getByRole("dialog", { name: "Nieuwe afspraak" });
  await dialog.waitFor();
  return dialog;
}

async function selectStudent(dialog: Locator, query: string, name: string) {
  const field = dialog.getByRole("combobox", { name: "Leerling" });
  await field.fill(query);
  const option = dialog.getByRole("option", { name: new RegExp(name) });
  await option.waitFor();
  await option.click();
  await dialog.locator("[data-student-context-card]").waitFor();
}

async function clickNext(dialog: Locator) {
  await dialog.getByRole("button", { name: "Verder" }).click();
}

async function testMobileCalendarAndWizard(page: Page) {
  const renderStartedAt = performance.now();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/visual-fixtures/instructeur/agenda`, {
    waitUntil: "networkidle",
  });
  await page.locator("[data-instructor-day-calendar]").waitFor();
  const renderMs = Math.round(performance.now() - renderStartedAt);
  assert.ok(renderMs < 5_000, `calendar render took ${renderMs}ms`);
  await assertViewportContract(page);

  assert.equal(await page.locator('[role="gridcell"]').count(), 96);
  assert.equal(
    await page.locator('[data-calendar-grid-line="hour"]').count(),
    25,
  );
  assert.equal(
    await page.locator('[data-calendar-grid-line="half-hour"]').count(),
    24,
  );
  assert.equal(
    await page.locator('[data-calendar-grid-line="quarter-hour"]').count(),
    48,
  );
  assert.equal(await page.locator("[data-current-time-indicator]").count(), 1);

  const scroller = page.locator("[data-calendar-scroll-viewport]");
  await page.waitForFunction(() => {
    const viewport = document.querySelector<HTMLElement>(
      "[data-calendar-scroll-viewport]",
    );
    return Boolean(viewport && viewport.scrollTop > 250);
  });
  const beforeOpen = await scroller.evaluate((element) => element.scrollTop);
  const wizardStartedAt = performance.now();
  const dialog = await openWizard(page, "13:15");
  assert.ok(performance.now() - wizardStartedAt < 1_000);
  assert.equal(
    await dialog.locator("[data-wizard-type-select]").inputValue(),
    "lesson",
  );
  const dialogBox = await dialog.boundingBox();
  const titleBox = await dialog
    .getByRole("heading", { name: "Nieuwe afspraak" })
    .boundingBox();
  assert.ok(dialogBox && titleBox && titleBox.y >= dialogBox.y + 16);
  assert.ok(dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= 844);

  await clickNext(dialog);
  const studentField = dialog.getByRole("combobox", { name: "Leerling" });
  let wizardPosts = 0;
  const countPost = (request: { method(): string; url(): string }) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/visual-fixtures/instructeur/agenda")
    ) {
      wizardPosts += 1;
    }
  };
  page.on("request", countPost);
  await studentField.fill("mi");
  await page.waitForTimeout(350);
  assert.equal(
    wizardPosts,
    0,
    "two characters must not trigger student search",
  );
  await studentField.fill("mil");
  await dialog.getByRole("option", { name: /Milan de Vries/ }).waitFor();
  assert.ok(wizardPosts >= 1, "three characters must trigger server search");
  page.off("request", countPost);
  await studentField.press("Enter");
  await dialog.locator("[data-selected-student]").waitFor();
  await dialog.locator("[data-student-context-card]").waitFor();
  assert.match((await dialog.textContent()) ?? "", /06 12 34 56 78/);
  assert.match((await dialog.textContent()) ?? "", /90 minuten/);

  await clickNext(dialog);
  const defaultPickup = dialog.getByRole("radio", {
    name: /Thuis · standaard/,
  });
  assert.equal(await defaultPickup.isChecked(), true);
  assert.match((await dialog.textContent()) ?? "", /Duivelandsestraat 12/);
  await clickNext(dialog);
  assert.equal(await dialog.locator("#wizard-date").inputValue(), "2026-08-11");
  assert.equal(await dialog.locator("#wizard-time").inputValue(), "13:15");
  assert.equal(await dialog.locator("#wizard-duration").inputValue(), "90");
  assert.equal(await dialog.locator("#wizard-buffer-after").inputValue(), "15");
  assert.equal(await dialog.locator("#wizard-vehicle").count(), 0);
  await clickNext(dialog);
  await dialog.locator("[data-wizard-summary]").waitFor();
  assert.match((await dialog.textContent()) ?? "", /Toyota Yaris 04/);
  assert.match((await dialog.textContent()) ?? "", /automatisch toegewezen/);

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  const afterClose = await scroller.evaluate((element) => element.scrollTop);
  assert.ok(
    Math.abs(afterClose - beforeOpen) <= 2,
    "wizard must preserve scroll",
  );

  const keyboardSlot = page.getByRole("gridcell", {
    name: /Nieuwe afspraak toevoegen, dinsdag 11 augustus, 10:30/,
  });
  await keyboardSlot.focus();
  await page.keyboard.press("ArrowDown");
  assert.match(
    (await page.locator(":focus").getAttribute("aria-label")) ?? "",
    /10:45/,
  );
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Nieuwe afspraak" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("gridcell", {
        name: /Nieuwe afspraak toevoegen, dinsdag 11 augustus, 10:45/,
      })
      .evaluate((element) => document.activeElement === element),
    true,
  );

  const event = page.locator('[data-calendar-event="appointment-3"]');
  await event.scrollIntoViewIfNeeded();
  await event.click();
  const quickView = page.locator("[data-appointment-quick-view]");
  await quickView.waitFor();
  assert.match((await quickView.textContent()) ?? "", /24 min reistijd/);
  await page.keyboard.press("Escape");

  const overlap = await page.evaluate(() => {
    const first = document.querySelector<HTMLElement>(
      '[data-calendar-event="appointment-2"]',
    );
    const second = document.querySelector<HTMLElement>(
      '[data-calendar-event="appointment-overlap"]',
    );
    if (!first || !second) return null;
    const left = first.getBoundingClientRect();
    const right = second.getBoundingClientRect();
    return {
      separateColumns: left.right <= right.left + 1,
      similarWidths: Math.abs(left.width - right.width) <= 3,
    };
  });
  assert.deepEqual(overlap, { separateColumns: true, similarWidths: true });
}

async function testLessonCreate(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${baseUrl}/visual-fixtures/instructeur/agenda?fixture=empty`,
    {
      waitUntil: "networkidle",
    },
  );
  const dialog = await openWizard(page, "13:30");
  await clickNext(dialog);
  await selectStudent(dialog, "noa", "Noah Jansen");
  await clickNext(dialog);
  await clickNext(dialog);
  await clickNext(dialog);
  await dialog.getByRole("button", { name: "Rijles toevoegen" }).click();
  await page.waitForURL(/created=lesson/);
  const event = page.locator('[data-calendar-event="appointment-created"]');
  await event.waitFor();
  assert.match((await event.textContent()) ?? "", /13:30/);
  assert.match((await event.textContent()) ?? "", /Noah Jansen/);
}

async function testPrivateCreate(page: Page) {
  await page.goto(
    `${baseUrl}/visual-fixtures/instructeur/agenda?fixture=empty`,
    {
      waitUntil: "networkidle",
    },
  );
  const dialog = await openWizard(page, "15:00");
  await dialog
    .locator("[data-wizard-type-select]")
    .selectOption("private_block");
  await clickNext(dialog);
  assert.equal(
    await dialog.getByRole("combobox", { name: "Leerling" }).count(),
    0,
  );
  assert.equal(await dialog.locator("#wizard-vehicle").count(), 0);
  await dialog.locator("#wizard-title").fill("Tandarts");
  await clickNext(dialog);
  await clickNext(dialog);
  await dialog.getByRole("button", { name: "Privé toevoegen" }).click();
  await page.waitForURL(/created=private_block/);
  assert.match(
    (await page
      .locator('[data-calendar-event="appointment-created"]')
      .textContent()) ?? "",
    /Privé/,
  );
}

async function testExamAndVehicleFlows(page: Page) {
  await page.goto(
    `${baseUrl}/visual-fixtures/instructeur/agenda?fixture=empty`,
    {
      waitUntil: "networkidle",
    },
  );
  let dialog = await openWizard(page, "08:30");
  await dialog.locator("[data-wizard-type-select]").selectOption("exam");
  await clickNext(dialog);
  await selectStudent(dialog, "mil", "Milan de Vries");
  await clickNext(dialog);
  await clickNext(dialog);
  assert.equal(
    await dialog.locator("#wizard-destination").inputValue(),
    "cbr-rijswijk",
  );
  await clickNext(dialog);
  assert.equal(await dialog.locator("#wizard-duration").inputValue(), "120");
  assert.equal(await dialog.locator("#wizard-duration").isDisabled(), true);
  assert.equal(
    await dialog.locator("#wizard-buffer-before").inputValue(),
    "30",
  );
  assert.equal(await dialog.locator("#wizard-buffer-after").inputValue(), "30");
  await page.keyboard.press("Escape");

  dialog = await openWizard(page, "18:00");
  await dialog.locator("[data-wizard-type-select]").selectOption("maintenance");
  await clickNext(dialog);
  await clickNext(dialog);
  const vehicle = dialog.locator("#wizard-vehicle");
  await vehicle.waitFor();
  assert.equal(await vehicle.locator("option").count(), 3);
  await vehicle.selectOption("vehicle-1");
  await clickNext(dialog);
  await dialog.locator("[data-wizard-summary]").waitFor();
  await page.keyboard.press("Escape");
}

async function testPlanningWarning(page: Page) {
  await page.goto(
    `${baseUrl}/visual-fixtures/instructeur/agenda?fixture=empty`,
    {
      waitUntil: "networkidle",
    },
  );
  const dialog = await openWizard(page, "13:45");
  await clickNext(dialog);
  await selectStudent(dialog, "mil", "Milan de Vries");
  await clickNext(dialog);
  await clickNext(dialog);
  await clickNext(dialog);
  await dialog.locator('[data-planning-status="blocked"]').waitFor();
  assert.match((await dialog.textContent()) ?? "", /24 min reistijd/);
  assert.equal(await dialog.locator("#wizard-override-reason").count(), 1);
  await page.keyboard.press("Escape");
}

async function testLateCurrentTimeFocus(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/visual-fixtures/instructeur/agenda?clock=late`, {
    waitUntil: "networkidle",
  });
  const currentTime = page.locator("[data-current-time-indicator]");
  await currentTime.waitFor();
  assert.match((await currentTime.getAttribute("aria-label")) ?? "", /23:04/);
  await page.waitForFunction(() => {
    const viewport = document.querySelector<HTMLElement>(
      "[data-calendar-scroll-viewport]",
    );
    const indicator = document.querySelector<HTMLElement>(
      "[data-current-time-indicator]",
    );
    if (!viewport || !indicator) return false;
    const viewportBox = viewport.getBoundingClientRect();
    const indicatorBox = indicator.getBoundingClientRect();
    return (
      indicatorBox.top >= viewportBox.top &&
      indicatorBox.bottom <= viewportBox.bottom
    );
  });
}

async function testTablet(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/visual-fixtures/instructeur/agenda`, {
    waitUntil: "networkidle",
  });
  await assertViewportContract(page);
  const calendarWidth = await page
    .locator("[data-instructor-day-calendar]")
    .evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(calendarWidth >= 500 && calendarWidth <= 1050);
  const dialog = await openWizard(page, "13:15");
  const box = await dialog
    .locator("[data-smart-appointment-wizard]")
    .boundingBox();
  assert.ok(box && box.width >= 500 && box.width <= 600);
  assert.ok(box.y >= 0 && box.y + box.height <= height);
  const closeButton = dialog.getByRole("button", { name: "Sluiten" });
  const closeBox = await closeButton.boundingBox();
  assert.ok(closeBox && closeBox.width >= 44 && closeBox.height >= 44);
  await page.keyboard.press("Escape");
}

async function testDaySwitch(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/visual-fixtures/instructeur/agenda`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("link", { name: "Vorige dag" }).click();
  await page.waitForURL(/datum=2026-08-10/);
  await page.locator("[data-instructor-day-calendar]").waitFor();
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  try {
    await testMobileCalendarAndWizard(page);
    await testLateCurrentTimeFocus(page);
    await testLessonCreate(page);
    await testPrivateCreate(page);
    await testExamAndVehicleFlows(page);
    await testPlanningWarning(page);
    await testDaySwitch(page);
    await testTablet(page, 768, 1024);
    await testTablet(page, 834, 1194);
    await testTablet(page, 1024, 768);
    await testTablet(page, 1194, 834);
  } finally {
    await browser.close();
  }
  console.log(
    "Instructor day calendar and smart appointment wizard E2E passed.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
