/**
 * Pixel consistency guard for stable public NXTDRIVE surfaces.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run visual:regression
 *   pnpm --filter @workspace/scripts run visual:update
 *
 * Optional:
 *   NXTDRIVE_VISUAL_BASE_URL=http://127.0.0.1:22557
 *   NXTDRIVE_VISUAL_ROUTES='[{"name":"learner-mobile","path":"/leerling","width":390,"height":900}]'
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";

type VisualCase = {
  name: string;
  path: string;
  width: number;
  height: number;
  waitForSelector?: string;
  publicScreenshot?: string;
  theme?: "light" | "dark";
  setup?: "quick-add" | "overlap";
};

const DEFAULT_CASES: VisualCase[] = [
  { name: "login-desktop", path: "/login", width: 1440, height: 1000 },
  {
    name: "login-mobile",
    path: "/login",
    width: 390,
    height: 844,
  },
  {
    name: "privacy-tablet",
    path: "/privacy",
    width: 1024,
    height: 1366,
  },
  {
    name: "account-deletion-mobile",
    path: "/account-verwijderen",
    width: 390,
    height: 844,
  },
  {
    name: "backoffice-cockpit-desktop",
    path: "/visual-fixtures/dashboard",
    width: 1440,
    height: 1000,
    waitForSelector: "[data-management-shell]",
  },
  {
    name: "instructor-cockpit-mobile",
    path: "/visual-fixtures/instructeur",
    width: 390,
    height: 844,
    waitForSelector: "[data-instructor-shell]",
    publicScreenshot: "instructor-1.png",
  },
  {
    name: "instructor-agenda-desktop",
    path: "/visual-fixtures/instructeur/agenda",
    width: 1440,
    height: 1000,
    waitForSelector: "[data-instructor-shell]",
    publicScreenshot: "instructor-2.png",
  },
  {
    name: "instructor-agenda-mobile-empty",
    path: "/visual-fixtures/instructeur/agenda?fixture=empty",
    width: 390,
    height: 844,
    waitForSelector: "[data-instructor-day-calendar]",
    theme: "light",
  },
  {
    name: "instructor-agenda-mobile-filled",
    path: "/visual-fixtures/instructeur/agenda",
    width: 390,
    height: 844,
    waitForSelector: "[data-instructor-day-calendar]",
    theme: "light",
  },
  {
    name: "instructor-agenda-mobile-overlap",
    path: "/visual-fixtures/instructeur/agenda?fixture=overlap",
    width: 390,
    height: 844,
    waitForSelector: "[data-instructor-day-calendar]",
    theme: "light",
    setup: "overlap",
  },
  {
    name: "instructor-agenda-mobile-current-time",
    path: "/visual-fixtures/instructeur/agenda?clock=late",
    width: 430,
    height: 932,
    waitForSelector: "[data-current-time-indicator]",
    theme: "light",
  },
  {
    name: "instructor-agenda-mobile-quick-add",
    path: "/visual-fixtures/instructeur/agenda",
    width: 390,
    height: 844,
    waitForSelector: "[data-instructor-day-calendar]",
    theme: "light",
    setup: "quick-add",
  },
  {
    name: "instructor-agenda-tablet-portrait",
    path: "/visual-fixtures/instructeur/agenda",
    width: 768,
    height: 1024,
    waitForSelector: "[data-instructor-day-calendar]",
    theme: "light",
  },
  {
    name: "instructor-agenda-tablet-landscape",
    path: "/visual-fixtures/instructeur/agenda",
    width: 1024,
    height: 768,
    waitForSelector: "[data-instructor-day-calendar]",
    theme: "light",
  },
  {
    name: "instructor-agenda-tablet-current-time",
    path: "/visual-fixtures/instructeur/agenda",
    width: 834,
    height: 1194,
    waitForSelector: "[data-current-time-indicator]",
    theme: "light",
  },
  {
    name: "instructor-agenda-tablet-travel-conflict",
    path: "/visual-fixtures/instructeur/agenda?afspraak=appointment-3",
    width: 1024,
    height: 768,
    waitForSelector: "[data-appointment-quick-view]",
    theme: "light",
  },
  {
    name: "instructor-agenda-dark",
    path: "/visual-fixtures/instructeur/agenda",
    width: 390,
    height: 844,
    waitForSelector: "[data-instructor-day-calendar]",
    theme: "dark",
  },
  {
    name: "learner-cockpit-mobile",
    path: "/visual-fixtures/leerling",
    width: 390,
    height: 844,
    publicScreenshot: "student-1.png",
  },
  {
    name: "learner-cockpit-desktop",
    path: "/visual-fixtures/leerling",
    width: 1440,
    height: 1000,
    publicScreenshot: "student-2.png",
  },
  {
    name: "maps-address-autocomplete",
    path: "/visual-fixtures/maps?view=autocomplete",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-manual-correction",
    path: "/visual-fixtures/maps?view=manual",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-student-locations",
    path: "/visual-fixtures/maps?view=student-locations",
    width: 390,
    height: 844,
  },
  {
    name: "maps-lesson-location-picker",
    path: "/visual-fixtures/maps?view=lesson-location",
    width: 390,
    height: 844,
  },
  {
    name: "maps-student-confirmation",
    path: "/visual-fixtures/maps?view=student-confirmation",
    width: 390,
    height: 844,
  },
  {
    name: "maps-instructor-next",
    path: "/visual-fixtures/maps?view=instructor-next",
    width: 390,
    height: 844,
  },
  {
    name: "maps-instructor-day-tablet",
    path: "/visual-fixtures/maps?view=instructor-day",
    width: 1024,
    height: 768,
  },
  {
    name: "maps-instructor-day-mobile",
    path: "/visual-fixtures/maps?view=instructor-day",
    width: 390,
    height: 844,
  },
  {
    name: "maps-planboard-desktop",
    path: "/visual-fixtures/maps?view=planboard",
    width: 1440,
    height: 1000,
  },
  {
    name: "maps-planboard-tablet",
    path: "/visual-fixtures/maps?view=planboard",
    width: 1024,
    height: 768,
  },
  {
    name: "maps-route-conflict",
    path: "/visual-fixtures/maps?view=conflict",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-route-optimization",
    path: "/visual-fixtures/maps?view=optimization",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-cancellation-recovery",
    path: "/visual-fixtures/maps?view=cancellation",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-work-areas",
    path: "/visual-fixtures/maps?view=work-areas",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-empty-miles",
    path: "/visual-fixtures/maps?view=empty-miles",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-postcode-analysis",
    path: "/visual-fixtures/maps?view=postcode",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-cbr-catalog",
    path: "/visual-fixtures/maps?view=cbr",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-control-center",
    path: "/visual-fixtures/maps?view=control",
    width: 1440,
    height: 1000,
  },
  {
    name: "maps-tenant-limits",
    path: "/visual-fixtures/maps?view=limits",
    width: 1280,
    height: 900,
  },
  {
    name: "maps-degraded-state",
    path: "/visual-fixtures/maps?view=degraded",
    width: 1280,
    height: 900,
  },
];

function repoRoot(): string {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function compareScreenshots(
  baseline: Buffer,
  actual: Buffer,
): Promise<{ equal: boolean; detail?: string }> {
  if (sha256(actual) === sha256(baseline)) {
    return { equal: true };
  }

  const [expectedPixels, actualPixels] = await Promise.all([
    sharp(baseline).raw().toBuffer({ resolveWithObject: true }),
    sharp(actual).raw().toBuffer({ resolveWithObject: true }),
  ]);

  const sameShape =
    expectedPixels.info.width === actualPixels.info.width &&
    expectedPixels.info.height === actualPixels.info.height &&
    expectedPixels.info.channels === actualPixels.info.channels;
  if (!sameShape) {
    return {
      equal: false,
      detail: `dimensions changed (${expectedPixels.info.width}x${expectedPixels.info.height} -> ${actualPixels.info.width}x${actualPixels.info.height})`,
    };
  }

  let oneStepChannelDifferences = 0;
  for (let index = 0; index < expectedPixels.data.length; index += 1) {
    const delta = Math.abs(
      expectedPixels.data[index] - actualPixels.data[index],
    );
    if (delta > 1) {
      return {
        equal: false,
        detail: `rendered pixels changed (channel delta ${delta} at byte ${index})`,
      };
    }
    if (delta === 1) oneStepChannelDifferences += 1;
  }

  const noiseLimit = Math.max(
    64,
    Math.floor(expectedPixels.data.length * 0.00001),
  );
  if (oneStepChannelDifferences > noiseLimit) {
    return {
      equal: false,
      detail: `${oneStepChannelDifferences} one-step channel changes exceed the render-noise limit of ${noiseLimit}`,
    };
  }

  return {
    equal: true,
    detail:
      oneStepChannelDifferences > 0
        ? `ignored ${oneStepChannelDifferences} one-step antialiasing channel changes`
        : undefined,
  };
}

function normalizeBaseUrl(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function visualCases(): VisualCase[] {
  const raw = process.env.NXTDRIVE_VISUAL_ROUTES;
  if (!raw) return DEFAULT_CASES;

  const parsed = JSON.parse(raw) as VisualCase[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("NXTDRIVE_VISUAL_ROUTES must be a non-empty JSON array.");
  }

  return parsed.map((entry) => {
    if (!entry.name || !entry.path || !entry.width || !entry.height) {
      throw new Error(
        "Each NXTDRIVE_VISUAL_ROUTES entry needs name, path, width and height.",
      );
    }
    return entry;
  });
}

async function preparePage(
  page: Page,
  visualCase: VisualCase,
  baseUrl: string,
) {
  await page.clock.install({
    time: new Date("2026-07-30T12:00:00.000+02:00"),
  });
  await page.setViewportSize({
    width: visualCase.width,
    height: visualCase.height,
  });
  if (visualCase.theme) {
    await page
      .context()
      .addCookies([
        { name: "nxt_theme", value: visualCase.theme, url: baseUrl },
      ]);
  }
  await page.goto(`${baseUrl}${visualCase.path}`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (visualCase.waitForSelector) {
    await page.waitForSelector(visualCase.waitForSelector, { timeout: 10_000 });
  }
  if (visualCase.setup === "quick-add") {
    await page
      .getByRole("gridcell", {
        name: /Nieuwe afspraak toevoegen, dinsdag 11 augustus, 13:15/,
      })
      .click();
    await page.waitForSelector("[data-appointment-create-sheet]", {
      timeout: 10_000,
    });
  }
  if (visualCase.setup === "overlap") {
    await page
      .locator('[data-calendar-event="appointment-2"]')
      .scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(150);
}

async function capture(
  browser: Browser,
  visualCase: VisualCase,
  baseUrl: string,
) {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
  });
  try {
    await preparePage(page, visualCase, baseUrl);
    return await page.screenshot({
      fullPage: true,
      type: "png",
      animations: "disabled",
    });
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const update = process.argv.includes("--update");
  const baseUrl = normalizeBaseUrl(
    process.env.NXTDRIVE_VISUAL_BASE_URL ?? "http://127.0.0.1:22557",
  );
  const root = repoRoot();
  const baselineDir = path.join(root, "scripts", "visual-baselines");
  const actualDir = path.join(root, "scripts", ".visual-regression");
  const publicScreenshotDir = path.join(
    root,
    "artifacts",
    "nxtdrive",
    "public",
    "screenshots",
  );
  const cases = visualCases();
  const failures: string[] = [];

  await mkdir(baselineDir, { recursive: true });
  await mkdir(actualDir, { recursive: true });
  await mkdir(publicScreenshotDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const visualCase of cases) {
      const image = await capture(browser, visualCase, baseUrl);
      const baselinePath = path.join(baselineDir, `${visualCase.name}.png`);
      const actualPath = path.join(actualDir, `${visualCase.name}.png`);
      await writeFile(actualPath, image);

      if (update) {
        await writeFile(baselinePath, image);
        if (visualCase.publicScreenshot) {
          await writeFile(
            path.join(publicScreenshotDir, visualCase.publicScreenshot),
            image,
          );
        }
        console.log(`UPDATED ${visualCase.name}`);
        continue;
      }

      let baseline: Buffer;
      try {
        baseline = await readFile(baselinePath);
      } catch {
        failures.push(
          `${visualCase.name}: missing baseline. Run visual:update once after validating the screenshot.`,
        );
        continue;
      }

      const comparison = await compareScreenshots(baseline, image);
      if (!comparison.equal) {
        failures.push(
          `${visualCase.name}: ${comparison.detail ?? "screenshot changed"}. Actual written to scripts/.visual-regression/${visualCase.name}.png`,
        );
      } else {
        console.log(
          `OK ${visualCase.name}${comparison.detail ? ` (${comparison.detail})` : ""}`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) {
      console.error(`FAIL ${failure}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("Visual regression baselines passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
