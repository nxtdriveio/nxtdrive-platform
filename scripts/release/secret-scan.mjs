import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const forbiddenExtensions = new Set([".jks", ".keystore", ".p12", ".pfx"]);
const textExtensions = new Set([
  "",
  ".env",
  ".gradle",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".properties",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    "service account private key",
    /"type"\s*:\s*"service_account"[\s\S]{0,2000}"private_key"\s*:/,
  ],
];

const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const relativePath of tracked) {
  const extension = extname(relativePath).toLowerCase();
  if (forbiddenExtensions.has(extension)) {
    findings.push(`${relativePath}: forbidden signing/credential file`);
    continue;
  }
  if (
    relativePath === "scripts/release/secret-scan.mjs" ||
    !textExtensions.has(extension)
  ) {
    continue;
  }
  const path = resolve(root, relativePath);
  const fileStat = await stat(path).catch(() => null);
  if (!fileStat?.isFile() || fileStat.size > 2_000_000) continue;
  const source = await readFile(path, "utf8");
  for (const [label, pattern] of patterns) {
    if (pattern.test(source)) findings.push(`${relativePath}: ${label}`);
  }
}

if (findings.length > 0) {
  console.error(findings.map((finding) => `- ${finding}`).join("\n"));
  process.exit(1);
}
console.log(`Secret scan passed for ${tracked.length} repository files.`);
