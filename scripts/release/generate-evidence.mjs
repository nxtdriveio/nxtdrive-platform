import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const evidence = resolve(root, "release-evidence");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json")));
const appPackage = JSON.parse(
  await readFile(resolve(root, "artifacts/nxtdrive/package.json")),
);

function command(commandName, args, fallback = null) {
  try {
    return execFileSync(commandName, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return fallback;
  }
}

async function findFiles(directory, predicate) {
  const directoryStat = await stat(directory).catch(() => null);
  if (!directoryStat?.isDirectory()) return [];
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory())
      results.push(...(await findFiles(path, predicate)));
    else if (entry.isFile() && predicate(path)) results.push(path);
  }
  return results;
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

for (const directory of [
  "sbom",
  "test-results",
  "e2e-results",
  "visual-results",
  "migration-results",
  "build-checksums",
  "android",
  "screenshots",
]) {
  await mkdir(resolve(evidence, directory), { recursive: true });
}

const audit = spawnSync("pnpm", ["audit", "--prod", "--json"], {
  cwd: root,
  encoding: "utf8",
});
const auditBody = audit.stdout || audit.stderr;
await writeFile(
  resolve(evidence, "dependency-audit.json"),
  auditBody.endsWith("\n") ? auditBody : `${auditBody}\n`,
);

const dependencyOutput = command(
  "pnpm",
  ["list", "-r", "--prod", "--depth", "Infinity", "--json"],
  "[]",
);
const workspaces = JSON.parse(dependencyOutput);
const componentMap = new Map();
function collectDependencies(dependencies = {}) {
  for (const [name, value] of Object.entries(dependencies)) {
    const version = value.version ?? "unknown";
    componentMap.set(`${name}@${version}`, {
      type: "library",
      name,
      version,
      purl:
        version === "unknown"
          ? undefined
          : `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
    });
    collectDependencies(value.dependencies);
  }
}
for (const workspace of workspaces) collectDependencies(workspace.dependencies);
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      name: "NXTDRIVE",
      version: appPackage.version,
    },
  },
  components: Array.from(componentMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  ),
};
await writeFile(
  resolve(evidence, "sbom/cyclonedx.json"),
  `${JSON.stringify(sbom, null, 2)}\n`,
);

const androidRoot = resolve(
  root,
  "artifacts/nxtdrive/android/app/build/outputs",
);
const aabs = await findFiles(androidRoot, (path) => path.endsWith(".aab"));
const aab =
  aabs.find((path) => path.includes("/production/")) ?? aabs[0] ?? null;
const aabChecksum = aab ? await sha256(aab) : null;
const aabKind = aab
  ? aab.includes("/production/")
    ? "production"
    : "staging-dry-run"
  : null;
if (aab) {
  await writeFile(
    resolve(evidence, "android/aab.json"),
    `${JSON.stringify(
      {
        file: aab.slice(root.length + 1),
        kind: aabKind,
        sha256: aabChecksum,
        signingFingerprint: process.env.ANDROID_SIGNING_FINGERPRINT ?? null,
      },
      null,
      2,
    )}\n`,
  );
}

const checksummedFiles = await findFiles(
  resolve(root, "artifacts/nxtdrive/android/play-store/graphics"),
  (path) => /\.(?:png|jpe?g)$/i.test(path),
);
const checksums = [];
for (const path of checksummedFiles) {
  checksums.push({
    file: path.slice(root.length + 1),
    sha256: await sha256(path),
  });
}
if (aab)
  checksums.push({ file: aab.slice(root.length + 1), sha256: aabChecksum });
await writeFile(
  resolve(evidence, "build-checksums/sha256.json"),
  `${JSON.stringify(checksums, null, 2)}\n`,
);

const manifest = {
  schemaVersion: 1,
  commitSha: command("git", ["rev-parse", "HEAD"], "unknown"),
  branch: command("git", ["branch", "--show-current"], "detached"),
  buildTime: new Date().toISOString(),
  nodeVersion: process.version,
  packageManager: packageJson.packageManager,
  appVersion: process.env.ANDROID_VERSION_NAME ?? appPackage.version,
  databaseMigrationVersion: command(
    "bash",
    [
      "-lc",
      "find supabase/migrations -maxdepth 1 -name '*.sql' -printf '%f\\n' | sort | tail -n 1",
    ],
    null,
  ),
  readinessEngineVersion: process.env.READINESS_ENGINE_VERSION ?? null,
  curriculumVersions: [],
  dependencyAuditStatus: audit.status === 0 ? "pass" : "fail",
  testSummary: process.env.RELEASE_TEST_SUMMARY ?? "not-provided",
  aabPath: aab ? aab.slice(root.length + 1) : null,
  aabKind,
  aabChecksum,
  signingCertificateFingerprint:
    process.env.ANDROID_SIGNING_FINGERPRINT ?? null,
  deploymentStatus: process.env.RELEASE_DEPLOYMENT_STATUS ?? "not-deployed",
};
await writeFile(
  resolve(evidence, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  resolve(evidence, "git-metadata.json"),
  `${JSON.stringify(
    {
      commitSha: manifest.commitSha,
      branch: manifest.branch,
      status: command("git", ["status", "--short"], ""),
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Release evidence generated (${componentMap.size} SBOM components, ${
    aab ? basename(aab) : "no AAB present"
  }).`,
);
