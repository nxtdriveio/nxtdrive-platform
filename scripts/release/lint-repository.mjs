import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const failures = [];

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

const requiredWorkflows = [
  "ci.yml",
  "e2e.yml",
  "visual-regression.yml",
  "security.yml",
  "deploy-staging.yml",
  "deploy-production.yml",
  "android-internal.yml",
  "android-production.yml",
];

for (const workflow of requiredWorkflows) {
  try {
    const source = await text(`.github/workflows/${workflow}`);
    if (/uses:\s+[^@\s]+@(main|master|latest)\b/.test(source)) {
      failures.push(`${workflow}: mutable action reference`);
    }
  } catch {
    failures.push(`${workflow}: missing required workflow`);
  }
}

const packageJson = JSON.parse(await text("package.json"));
if (packageJson.packageManager !== "pnpm@10.26.1") {
  failures.push("packageManager must be pinned to pnpm@10.26.1");
}
if (packageJson.engines?.node !== ">=24.0.0 <25") {
  failures.push("Node 24 release line must be pinned in engines");
}

const variablesGradle = await text(
  "artifacts/nxtdrive/android/variables.gradle",
);
if (!/compileSdkVersion\s*=\s*36/.test(variablesGradle)) {
  failures.push("Android compileSdkVersion must be 36");
}
if (!/targetSdkVersion\s*=\s*36/.test(variablesGradle)) {
  failures.push("Android targetSdkVersion must be 36");
}

const manifest = await text(
  "artifacts/nxtdrive/android/app/src/main/AndroidManifest.xml",
);
if (!/android:usesCleartextTraffic="false"/.test(manifest)) {
  failures.push("Android manifest must block cleartext traffic");
}
if (!/android:autoVerify="true"/.test(manifest)) {
  failures.push("Android verified app link is missing");
}

const buildGradle = await text("artifacts/nxtdrive/android/app/build.gradle");
for (const buildType of ["debug", "staging", "production"]) {
  if (!new RegExp(`\\b${buildType}\\s*\\{`).test(buildGradle)) {
    failures.push(`Android ${buildType} build type is missing`);
  }
}
if (!buildGradle.includes("ANDROID_UPLOAD_KEYSTORE_PATH")) {
  failures.push("Android production signing is not environment-driven");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Repository release-policy lint passed.");
