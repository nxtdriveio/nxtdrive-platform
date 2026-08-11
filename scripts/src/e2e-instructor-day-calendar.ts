import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

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
      viewportWidth: window.innerWidth,
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
  assert.ok(
    Math.abs(metrics.shellHeight - metrics.viewportHeight) <= 1,
    `shell must equal the dynamic viewport: ${JSON.stringify(metrics)}`,
  );
  assert.equal(metrics.mainOverflowY, "hidden");
  assert.ok(metrics.calendarBottom <= metrics.viewportHeight + 1);
  assert.ok(metrics.scrollerScrollHeight > metrics.scrollerClientHeight);
  assert.ok(metrics.horizontalOverflow <= 0);
}

async function testMobile(page: Page) {
  const renderStartedAt = performance.now();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/visual-fixtures/instructeur/agenda`, {
    waitUntil: "networkidle",
  });
  await page.locator("[data-instructor-day-calendar]").waitFor();
  const initialRenderMs = Math.round(performance.now() - renderStartedAt);
  assert.ok(
    initialRenderMs < 5_000,
    `calendar render took ${initialRenderMs}ms`,
  );
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
  assert.equal(
    await page.locator('[data-calendar-event="appointment-2"]').count(),
    1,
  );

  const scroller = page.locator("[data-calendar-scroll-viewport]");
  await page.waitForFunction(() => {
    const viewport = document.querySelector<HTMLElement>(
      "[data-calendar-scroll-viewport]",
    );
    return Boolean(viewport && viewport.scrollTop > 250);
  });
  const initialScrollTop = await scroller.evaluate(
    (element) => element.scrollTop,
  );
  assert.ok(
    initialScrollTop > 250,
    "today must initially scroll near the current time",
  );
  const scrollTiming = await scroller.evaluate(async (element) => {
    const startedAt = performance.now();
    for (let frame = 0; frame < 20; frame += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      element.scrollTop += 32;
    }
    const elapsedMs = performance.now() - startedAt;
    return { averageFrameMs: elapsedMs / 20 };
  });
  assert.ok(
    scrollTiming.averageFrameMs < 35,
    `calendar scroll averaged ${scrollTiming.averageFrameMs}ms per frame`,
  );
  const headerTop = await page
    .locator("[data-instructor-day-calendar] > header")
    .evaluate((element) => element.getBoundingClientRect().top);
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  assert.equal(
    await page
      .locator("[data-instructor-day-calendar] > header")
      .evaluate((element) => element.getBoundingClientRect().top),
    headerTop,
  );

  const slot = page.getByRole("gridcell", {
    name: /Nieuwe afspraak toevoegen, dinsdag 11 augustus, 13:15/,
  });
  await slot.scrollIntoViewIfNeeded();
  const beforeQuickAddScroll = await scroller.evaluate(
    (element) => element.scrollTop,
  );
  const quickAddStartedAt = performance.now();
  await slot.click();
  const createDialog = page.getByRole("dialog", { name: "Nieuwe afspraak" });
  await createDialog.waitFor();
  const quickAddOpenMs = Math.round(performance.now() - quickAddStartedAt);
  assert.ok(quickAddOpenMs < 1_000, `quick-add took ${quickAddOpenMs}ms`);
  assert.equal(
    await createDialog.locator('input[name="date"]').inputValue(),
    "2026-08-11",
  );
  assert.equal(
    await createDialog.locator('input[name="time"]').inputValue(),
    "13:15",
  );
  assert.equal(
    await createDialog.locator('select[name="type"]').inputValue(),
    "lesson",
  );
  assert.equal(
    await createDialog.locator('select[name="type"]').isDisabled(),
    false,
  );
  await createDialog.locator('select[name="type"]').selectOption("break");
  assert.equal(
    await createDialog.locator('select[name="student_id"]').count(),
    0,
  );
  assert.equal(
    await createDialog.locator('select[name="duration_min"]').inputValue(),
    "30",
  );
  await createDialog.locator('select[name="type"]').selectOption("lesson");
  assert.equal(
    await createDialog.locator('select[name="duration_min"]').inputValue(),
    "60",
  );
  const dialogBox = await createDialog.boundingBox();
  const dialogTitleBox = await createDialog.getByRole("heading").boundingBox();
  assert.ok(dialogBox && dialogTitleBox);
  assert.ok(
    dialogTitleBox.y >= dialogBox.y + 16,
    "dialog title must have visible top spacing",
  );
  assert.equal(
    await createDialog.locator('select[name="student_id"]').count(),
    1,
  );
  await page.keyboard.press("Escape");
  await createDialog.waitFor({ state: "detached" });
  assert.ok(
    Math.abs(
      (await scroller.evaluate((element) => element.scrollTop)) -
        beforeQuickAddScroll,
    ) <= 1,
    "closing quick-add must preserve calendar scroll",
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

  const event = page.locator('[data-calendar-event="appointment-3"]');
  await event.scrollIntoViewIfNeeded();
  await event.click();
  const quickView = page.locator("[data-appointment-quick-view]");
  await quickView.waitFor();
  await quickView.getByRole("link", { name: "Navigeer" }).waitFor();
  assert.match(
    (await quickView.textContent()) ?? "",
    /24 min reistijd · 10 min beschikbaar/,
  );
  await page.keyboard.press("Escape");
  await quickView.waitFor({ state: "detached" });
  assert.equal(
    await event.evaluate((element) => document.activeElement === element),
    true,
  );

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
  console.log(
    `mobile timings: render=${initialRenderMs}ms quick-add=${quickAddOpenMs}ms ` +
      `scroll-frame=${scrollTiming.averageFrameMs.toFixed(1)}ms`,
  );
}

async function testCreateFlow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${baseUrl}/visual-fixtures/instructeur/agenda?fixture=empty`,
    { waitUntil: "networkidle" },
  );
  const slot = page.getByRole("gridcell", {
    name: /Nieuwe afspraak toevoegen, dinsdag 11 augustus, 13:30/,
  });
  await slot.scrollIntoViewIfNeeded();
  await slot.click();
  const dialog = page.getByRole("dialog", { name: "Nieuwe afspraak" });
  await dialog.locator('select[name="student_id"]').selectOption("student-1");
  const createStartedAt = performance.now();
  await dialog.getByRole("button", { name: "Afspraak toevoegen" }).click();
  await page.waitForURL(/created=lesson/);
  const createdEvent = page.locator(
    '[data-calendar-event="appointment-created"]',
  );
  await createdEvent.waitFor();
  const createFlowMs = Math.round(performance.now() - createStartedAt);
  assert.match((await createdEvent.textContent()) ?? "", /13:30/);
  assert.match((await createdEvent.textContent()) ?? "", /Noah Jansen/);
  console.log(`fixture create return=${createFlowMs}ms`);
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
    return Boolean(viewport && viewport.scrollTop > 1_000);
  });
  const focus = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      "[data-calendar-scroll-viewport]",
    );
    const indicator = document.querySelector<HTMLElement>(
      "[data-current-time-indicator]",
    );
    if (!viewport || !indicator) return null;
    const viewportBox = viewport.getBoundingClientRect();
    const indicatorBox = indicator.getBoundingClientRect();
    return {
      visible:
        indicatorBox.top >= viewportBox.top &&
        indicatorBox.bottom <= viewportBox.bottom,
      scrollTop: viewport.scrollTop,
    };
  });
  assert.ok(
    focus?.visible,
    `23:04 indicator must be focused: ${JSON.stringify(focus)}`,
  );
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
  await page.getByRole("button", { name: "Nieuwe afspraak toevoegen" }).click();
  await page.getByRole("dialog", { name: "Nieuwe afspraak" }).waitFor();
  await page.keyboard.press("Escape");
}

async function testDaySwitch(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/visual-fixtures/instructeur/agenda`, {
    waitUntil: "networkidle",
  });
  const startedAt = performance.now();
  await page.getByRole("link", { name: "Vorige dag" }).click();
  await page.waitForURL(/datum=2026-08-10/);
  await page.locator("[data-instructor-day-calendar]").waitFor();
  const daySwitchMs = Math.round(performance.now() - startedAt);
  assert.ok(daySwitchMs < 5_000, `day switch took ${daySwitchMs}ms`);
  console.log(`day switch=${daySwitchMs}ms`);
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
    await testMobile(page);
    await testLateCurrentTimeFocus(page);
    await testCreateFlow(page);
    await testDaySwitch(page);
    await testTablet(page, 768, 1024);
    await testTablet(page, 834, 1194);
    await testTablet(page, 1024, 768);
    await testTablet(page, 1194, 834);
  } finally {
    await browser.close();
  }
  console.log("Instructor day calendar mobile and tablet E2E passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
