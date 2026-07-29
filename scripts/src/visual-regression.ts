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

type VisualCase = {
  name: string;
  path: string;
  width: number;
  height: number;
  waitForSelector?: string;
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
];

function repoRoot(): string {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
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
  await page.setViewportSize({
    width: visualCase.width,
    height: visualCase.height,
  });
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
  const cases = visualCases();
  const failures: string[] = [];

  await mkdir(baselineDir, { recursive: true });
  await mkdir(actualDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const visualCase of cases) {
      const image = await capture(browser, visualCase, baseUrl);
      const baselinePath = path.join(baselineDir, `${visualCase.name}.png`);
      const actualPath = path.join(actualDir, `${visualCase.name}.png`);
      await writeFile(actualPath, image);

      if (update) {
        await writeFile(baselinePath, image);
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

      const actualHash = sha256(image);
      const baselineHash = sha256(baseline);
      if (actualHash !== baselineHash) {
        failures.push(
          `${visualCase.name}: screenshot hash changed (${baselineHash.slice(0, 8)} -> ${actualHash.slice(0, 8)}). Actual written to scripts/.visual-regression/${visualCase.name}.png`,
        );
      } else {
        console.log(`OK ${visualCase.name}`);
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
