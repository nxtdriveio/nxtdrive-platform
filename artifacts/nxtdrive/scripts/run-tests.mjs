import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const testRoots = [join(root, "lib"), join(root, "domains")];

function collectTests(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTests(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

const availableRoots = testRoots.filter((directory) =>
  statSync(directory, { throwIfNoEntry: false })?.isDirectory(),
);
if (availableRoots.length === 0) {
  console.error(`Test directories not found: ${testRoots.join(", ")}`);
  process.exit(1);
}

const files = availableRoots
  .flatMap((directory) => collectTests(directory))
  .map((file) => relative(root, file))
  .sort();

if (files.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

const tsxBin =
  process.platform === "win32"
    ? join(root, "node_modules", ".bin", "tsx.CMD")
    : join(root, "node_modules", ".bin", "tsx");

const result = spawnSync(tsxBin, ["--test", ...files], {
  cwd: root,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to start test runner: ${result.error.message}`);
}

process.exit(result.status ?? 1);
