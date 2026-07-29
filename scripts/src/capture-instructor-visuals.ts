/// <reference lib="dom" />

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

type ScreenshotCase = {
  name: string;
  route: string;
  displayPath: string;
  width: number;
  height: number;
};

const baseUrl = (
  process.env["NXTDRIVE_VISUAL_BASE_URL"] ?? "http://127.0.0.1:22557"
).replace(/\/+$/, "");

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputDir =
  process.env["NXTDRIVE_INSTRUCTOR_SCREENSHOT_DIR"] ??
  path.join(root, "release-evidence", "screenshots");

const cases: ScreenshotCase[] = [
  {
    name: "instructor-cockpit-tablet-landscape",
    route: "/visual-fixtures/instructeur",
    displayPath: "/instructeur",
    width: 1366,
    height: 1024,
  },
  {
    name: "instructor-cockpit-mobile",
    route: "/visual-fixtures/instructeur",
    displayPath: "/instructeur",
    width: 390,
    height: 844,
  },
  {
    name: "instructor-agenda-tablet-portrait",
    route: "/visual-fixtures/instructeur/agenda",
    displayPath: "/instructeur/agenda",
    width: 1024,
    height: 1366,
  },
];

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();

  try {
    for (const screenshotCase of cases) {
      const page = await browser.newPage({
        viewport: {
          width: screenshotCase.width,
          height: screenshotCase.height,
        },
        deviceScaleFactor: 1,
        locale: "nl-NL",
        timezoneId: "Europe/Amsterdam",
        colorScheme: "light",
        reducedMotion: "reduce",
      });

      try {
        await page.goto(`${baseUrl}${screenshotCase.route}`, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        await page.waitForSelector("[data-instructor-shell]", {
          timeout: 10_000,
        });
        await page.addStyleTag({
          content: `
            *, *::before, *::after {
              animation: none !important;
              caret-color: transparent !important;
              transition: none !important;
            }
          `,
        });

        // Keep the visual fixture isolated while making active navigation
        // reflect the production route shown in the screenshot.
        await page.evaluate((displayPath) => {
          window.history.replaceState(null, "", displayPath);
        }, screenshotCase.displayPath);
        await page.waitForTimeout(200);

        const outputPath = path.join(
          outputDir,
          `${screenshotCase.name}.png`,
        );
        const sidebarBackground = await page
          .locator("aside")
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor)
          .catch(() => "mobile");
        const layoutMetrics = await page.evaluate(() => {
          const main = document.querySelector("main");
          const inner = main?.firstElementChild;
          const content = inner?.firstElementChild;
          if (!main || !inner || !content) return null;
          return {
            mainClientHeight: main.clientHeight,
            mainScrollHeight: main.scrollHeight,
            mainScrollTop: main.scrollTop,
            innerHeight: Math.round(inner.getBoundingClientRect().height),
            contentHeight: Math.round(content.getBoundingClientRect().height),
            contentTop: Math.round(content.getBoundingClientRect().top),
            contentBottom: Math.round(content.getBoundingClientRect().bottom),
          };
        });
        const cockpitCards =
          screenshotCase.name === "instructor-cockpit-tablet-landscape"
            ? await page.evaluate(() =>
                Array.from(document.querySelectorAll("main section"))
                  .slice(1)
                  .map((section) => {
                    const rect = section.getBoundingClientRect();
                    const content = section.lastElementChild as HTMLElement | null;
                    return {
                      title:
                        section.querySelector("h2")?.textContent?.trim() ??
                        "zonder titel",
                      top: Math.round(rect.top),
                      left: Math.round(rect.left),
                      width: Math.round(rect.width),
                      height: Math.round(rect.height),
                      bottom: Math.round(rect.bottom),
                      overflowY: content
                        ? getComputedStyle(content).overflowY
                        : "missing",
                      clientHeight: content?.clientHeight ?? 0,
                      scrollHeight: content?.scrollHeight ?? 0,
                    };
                  }),
              )
            : [];

        if (cockpitCards.length > 0) {
          const widths = cockpitCards.map((card) => card.width);
          const quickLinks = cockpitCards.find(
            (card) => card.title === "Quick links",
          );
          const regularCards = cockpitCards.filter(
            (card) => card.title !== "Quick links",
          );
          const regularHeights = regularCards.map((card) => card.height);
          const equalWidths = Math.max(...widths) - Math.min(...widths) <= 1;
          const equalRegularHeights =
            Math.max(...regularHeights) - Math.min(...regularHeights) <= 1;
          const quickLinksSpansBothRows =
            quickLinks !== undefined &&
            Math.abs(quickLinks.height - (regularHeights[0] * 2 + 12)) <= 1 &&
            quickLinks.top ===
              cockpitCards.find((card) => card.title === "Volgende les")?.top &&
            quickLinks.bottom ===
              cockpitCards.find((card) => card.title === "Dagoverzicht")?.bottom;
          const withinViewport = cockpitCards.every(
            (card) => card.bottom <= screenshotCase.height,
          );
          const inlineScrollEnabled = cockpitCards.every(
            (card) => card.overflowY === "auto",
          );
          const inlineScrollUsed = cockpitCards.some(
            (card) => card.scrollHeight > card.clientHeight,
          );

          if (
            cockpitCards.length !== 5 ||
            !equalWidths ||
            !equalRegularHeights ||
            !quickLinksSpansBothRows ||
            !withinViewport ||
            !inlineScrollEnabled ||
            !inlineScrollUsed
          ) {
            throw new Error(
              `Cockpit card layout failed: ${JSON.stringify(cockpitCards)}`,
            );
          }
        }
        await page.screenshot({
          path: outputPath,
          type: "png",
          fullPage: false,
          animations: "disabled",
        });
        console.log(
          `WROTE ${outputPath} (sidebar: ${sidebarBackground}, layout: ${JSON.stringify(layoutMetrics)}, cockpitCards: ${JSON.stringify(cockpitCards)})`,
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
