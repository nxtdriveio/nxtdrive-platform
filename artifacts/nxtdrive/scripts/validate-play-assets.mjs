import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const store = resolve(root, "android/play-store");
const requireScreenshots = !process.argv.includes("--metadata-only");
const failures = [];

async function checkText(path, min, max) {
  const value = (await readFile(resolve(store, path), "utf8")).trim();
  if (value.length < min || value.length > max) {
    failures.push(`${path} length ${value.length}; expected ${min}-${max}`);
  }
}

async function checkImage(path, width, height) {
  const metadata = await sharp(resolve(store, path)).metadata();
  if (metadata.width !== width || metadata.height !== height) {
    failures.push(
      `${path} is ${metadata.width}x${metadata.height}; expected ${width}x${height}`,
    );
  }
}

await checkText("nl-NL/title.txt", 1, 30);
await checkText("nl-NL/short-description.txt", 1, 80);
await checkText("nl-NL/full-description.txt", 80, 4000);
await checkImage("graphics/icon/icon-512.png", 512, 512);
await checkImage(
  "graphics/feature-graphic/feature-graphic-1024x500.png",
  1024,
  500,
);

if (requireScreenshots) {
  for (const directory of ["phone", "tablet-7", "tablet-10"]) {
    const screenshotRoot = resolve(store, "graphics", directory);
    let provenance;
    try {
      provenance = JSON.parse(
        await readFile(resolve(screenshotRoot, "provenance.json"), "utf8"),
      );
    } catch {
      failures.push(
        `graphics/${directory}/provenance.json is missing or invalid; browser captures are not accepted`,
      );
      continue;
    }
    const files = (await readdir(screenshotRoot)).filter((file) =>
      /\.(?:png|jpe?g)$/i.test(file),
    );
    if (files.length < 2) {
      failures.push(
        `graphics/${directory} requires at least two real screenshots`,
      );
      continue;
    }
    for (const file of files) {
      const image = sharp(resolve(screenshotRoot, file));
      const { width = 0, height = 0 } = await image.metadata();
      const { channels } = await image.stats();
      const variation = channels.reduce(
        (total, channel) => total + channel.stdev,
        0,
      );
      if (width < 320 || height < 320 || variation < 8) {
        failures.push(
          `graphics/${directory}/${file} looks invalid or placeholder-only`,
        );
      }
      const recorded = provenance.files?.find((entry) => entry.file === file);
      const actualSha = createHash("sha256")
        .update(await readFile(resolve(screenshotRoot, file)))
        .digest("hex");
      if (
        provenance.source !== "installed-android-build" ||
        provenance.syntheticDataConfirmed !== true ||
        provenance.packageName !== "io.nxtdrive.instructeur" ||
        !recorded ||
        recorded.sha256 !== actualSha
      ) {
        failures.push(
          `graphics/${directory}/${file} lacks matching installed-build provenance`,
        );
      }
    }
    if (!String(provenance.versionName ?? "").startsWith("1.0.0")) {
      failures.push(
        `graphics/${directory} was not captured from a 1.0.0 installed build`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(
  `Play metadata${requireScreenshots ? " and screenshots" : ""} validated.`,
);
