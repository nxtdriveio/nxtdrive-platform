import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = (
  process.env["NXTDRIVE_E2E_BASE_URL"] ?? "http://127.0.0.1:22557"
).replace(/\/+$/, "");

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    reducedMotion: "reduce",
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `${baseUrl}/visual-fixtures/instructeur/agenda?fixture=empty`,
      { waitUntil: "networkidle" },
    );
    const slot = page.getByRole("gridcell", {
      name: /Nieuwe afspraak toevoegen, dinsdag 11 augustus, 13:30/,
    });
    await slot.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Nieuwe afspraak" });
    await dialog.waitFor();

    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    assert.ok(
      !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(viewport ?? ""),
    );

    const unlabeled = await dialog.evaluate((root) => {
      return Array.from(
        root.querySelectorAll<HTMLElement>("button,input,select,textarea"),
      )
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .filter((element) => {
          const id = element.id;
          const label = id
            ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
            : element.closest("label");
          return !(
            element.getAttribute("aria-label") ||
            element.getAttribute("aria-labelledby") ||
            label?.textContent?.trim() ||
            element.textContent?.trim() ||
            element.getAttribute("title")
          );
        })
        .map((element) => element.outerHTML.slice(0, 160));
    });
    assert.deepEqual(
      unlabeled,
      [],
      `unlabelled controls: ${unlabeled.join("\n")}`,
    );

    const smallTargets = await dialog.evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>("button,select"))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.height > 0 &&
            (box.width < 44 || box.height < 44)
          );
        })
        .map((element) => ({
          text:
            element.getAttribute("aria-label") ?? element.textContent?.trim(),
          box: element.getBoundingClientRect().toJSON(),
        })),
    );
    assert.deepEqual(
      smallTargets,
      [],
      `small tap targets: ${JSON.stringify(smallTargets)}`,
    );

    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press("Tab");
      assert.equal(
        await dialog.evaluate((root) => root.contains(document.activeElement)),
        true,
        "focus must remain trapped in the wizard",
      );
    }

    await dialog.getByRole("button", { name: "Verder" }).click();
    const student = dialog.getByRole("combobox", { name: "Leerling" });
    assert.equal(await student.getAttribute("aria-autocomplete"), "list");
    assert.ok(await student.getAttribute("aria-controls"));
    await student.fill("mi");
    await page.waitForTimeout(350);
    assert.match(
      (await dialog.getByRole("status").last().textContent()) ?? "",
      /3 tekens/,
    );
    await student.fill("mil");
    await dialog.getByRole("option", { name: /Milan de Vries/ }).waitFor();
    assert.equal(await student.getAttribute("aria-expanded"), "true");
    await student.press("ArrowDown");
    assert.ok(await student.getAttribute("aria-activedescendant"));
    await student.press("Enter");
    await dialog.locator("[data-selected-student]").waitFor();

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(
      await slot.evaluate((element) => document.activeElement === element),
      true,
    );
  } finally {
    await browser.close();
  }
  console.log("Smart appointment wizard accessibility E2E passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
