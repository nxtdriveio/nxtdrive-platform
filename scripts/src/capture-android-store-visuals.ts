import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

type ScreenshotClass = "phone" | "tablet-7" | "tablet-10";

type Capture = {
  file: string;
  label: string;
  deepLink: string;
};

const screenshotClass = process.env["ANDROID_SCREENSHOT_CLASS"] as
  | ScreenshotClass
  | undefined;
const packageName =
  process.env["ANDROID_SCREENSHOT_PACKAGE"] ?? "io.nxtdrive.instructeur";
const adb = process.env["ADB"] ?? "adb";
const serial = process.env["ANDROID_SERIAL"];
const nonInteractive =
  process.env["ANDROID_SCREENSHOT_NONINTERACTIVE"] === "true";
const syntheticConfirmed =
  process.env["ANDROID_SCREENSHOT_SYNTHETIC_DATA_CONFIRMED"] === "true";
const root = fileURLToPath(new URL("../../", import.meta.url));
const graphicsRoot = path.join(
  root,
  "artifacts/nxtdrive/android/play-store/graphics",
);

const captures: Capture[] = [
  {
    file: "01-cockpit.png",
    label: "Cockpit",
    deepLink: "https://nxtdrive.io/instructeur",
  },
  {
    file: "02-agenda.png",
    label: "Agenda",
    deepLink: "https://nxtdrive.io/instructeur/agenda",
  },
  {
    file: "03-leerlingen.png",
    label: "Leerlingen",
    deepLink: "https://nxtdrive.io/instructeur/leerlingen",
  },
  {
    file: "04-taken.png",
    label: "Taken",
    deepLink: "https://nxtdrive.io/instructeur/taken",
  },
  {
    file: "05-instellingen.png",
    label: "Instellingen",
    deepLink: "https://nxtdrive.io/instructeur/instellingen",
  },
];

function adbArgs(args: string[]) {
  return [...(serial ? ["-s", serial] : []), ...args];
}

function runAdb(args: string[]) {
  return execFileSync(adb, adbArgs(args), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runAdbBuffer(args: string[]) {
  return execFileSync(adb, adbArgs(args), {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function deviceValue(command: string) {
  return String(runAdb(["shell", command])).trim();
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function confirm(message: string) {
  if (nonInteractive) return;
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await prompt.question(`${message}\nDruk op Enter om verder te gaan. `);
  prompt.close();
}

async function main() {
  if (!["phone", "tablet-7", "tablet-10"].includes(screenshotClass ?? "")) {
    throw new Error(
      "Set ANDROID_SCREENSHOT_CLASS to phone, tablet-7 or tablet-10.",
    );
  }
  const targetClass = screenshotClass as ScreenshotClass;
  if (!syntheticConfirmed) {
    throw new Error(
      "Set ANDROID_SCREENSHOT_SYNTHETIC_DATA_CONFIRMED=true after confirming the installed account contains no real customer data.",
    );
  }

  const devices = String(runAdb(["devices"]));
  const activeDevices = devices
    .split("\n")
    .slice(1)
    .filter((line) => /\tdevice$/.test(line));
  if (activeDevices.length !== 1 && !serial) {
    throw new Error(
      `Expected exactly one connected Android device; found ${activeDevices.length}. Set ANDROID_SERIAL when needed.`,
    );
  }

  const packagePath = String(
    runAdb(["shell", "pm", "path", packageName]),
  ).trim();
  if (!packagePath.startsWith("package:")) {
    throw new Error(`${packageName} is not installed on the selected device.`);
  }

  const packageDump = String(
    runAdb(["shell", "dumpsys", "package", packageName]),
  );
  const versionName = packageDump.match(/versionName=([^\s]+)/)?.[1];
  const versionCode = packageDump.match(/versionCode=(\d+)/)?.[1];
  if (!versionName || !versionCode) {
    throw new Error("Could not read the installed package version.");
  }

  await confirm(
    `Open ${packageName} ${versionName} (${versionCode}), log in, wait until the native cockpit has loaded and verify that every visible record is synthetic.`,
  );

  const outputDirectory = path.join(graphicsRoot, targetClass);
  const oldFiles = (await readdir(outputDirectory)).filter((file) =>
    /\.(?:png|jpe?g)$/i.test(file),
  );
  for (const file of oldFiles) {
    await unlink(path.join(outputDirectory, file));
  }

  const component = `${packageName}/io.nxtdrive.instructeur.MainActivity`;
  const files: Array<{
    file: string;
    label: string;
    deepLink: string;
    sha256: string;
  }> = [];

  for (const capture of captures) {
    runAdb([
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      component,
      "-a",
      "android.intent.action.VIEW",
      "-d",
      capture.deepLink,
    ]);
    await wait(4_000);
    await confirm(
      `Controleer dat “${capture.label}” volledig geladen is en geen echte persoonsgegevens toont.`,
    );
    const png = runAdbBuffer(["exec-out", "screencap", "-p"]);
    if (
      !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      throw new Error(`Android returned an invalid PNG for ${capture.label}.`);
    }
    await writeFile(path.join(outputDirectory, capture.file), png);
    files.push({
      ...capture,
      sha256: sha256(png),
    });
    console.log(`WROTE ${targetClass}/${capture.file}`);
  }

  const provenance = {
    schemaVersion: 1,
    source: "installed-android-build",
    capturedAt: new Date().toISOString(),
    screenshotClass: targetClass,
    packageName,
    versionName,
    versionCode: Number(versionCode),
    device: {
      serial: serial ?? activeDevices[0]?.split("\t")[0] ?? "unknown",
      manufacturer: deviceValue("getprop ro.product.manufacturer"),
      model: deviceValue("getprop ro.product.model"),
      androidRelease: deviceValue("getprop ro.build.version.release"),
      sdk: Number(deviceValue("getprop ro.build.version.sdk")),
      size: deviceValue("wm size"),
      density: deviceValue("wm density"),
    },
    syntheticDataConfirmed: true,
    files,
  };
  await writeFile(
    path.join(outputDirectory, "provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Native ${targetClass} screenshots captured from installed ${packageName} ${versionName} (${versionCode}).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
