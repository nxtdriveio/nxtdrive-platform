import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const GOOGLE_DIR = path.join(
  ROOT,
  "domains",
  "maps",
  "infrastructure",
  "google",
);

test("every Google provider module is explicitly server-only", async () => {
  const files = (await readdir(GOOGLE_DIR)).filter((file) =>
    file.endsWith(".ts"),
  );
  assert.ok(files.length >= 3);
  for (const file of files) {
    const source = await readFile(path.join(GOOGLE_DIR, file), "utf8");
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_/);
    assert.doesNotMatch(source, /["']use client["']/);
  }
});

test("Google server credentials are never serialized into provider errors", async () => {
  const source = await readFile(path.join(GOOGLE_DIR, "http.ts"), "utf8");
  assert.doesNotMatch(source, /JSON\.stringify\(.*apiKey/);
  assert.doesNotMatch(source, /message.*apiKey/);
  assert.match(source, /X-Goog-Api-Key/);
});

test("provider requests use bounded timeouts and explicit field masks", async () => {
  const files = await Promise.all(
    ["google-location-provider.ts", "google-routing-provider.ts"].map((file) =>
      readFile(path.join(GOOGLE_DIR, file), "utf8"),
    ),
  );
  for (const source of files) assert.match(source, /fieldMask:/);
  const http = await readFile(path.join(GOOGLE_DIR, "http.ts"), "utf8");
  assert.match(http, /AbortSignal\.timeout/);
});

test("client components cannot import the server provider directory", async () => {
  const appRoot = path.join(ROOT, "app");
  const componentsRoot = path.join(ROOT, "components");
  const files = [
    ...(await walk(appRoot)),
    ...(await walk(componentsRoot)),
  ].filter((file) => /\.(?:ts|tsx)$/.test(file));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/^["']use client["'];?/m.test(source)) {
      assert.doesNotMatch(source, /infrastructure\/google/);
    }
  }
});

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [absolute];
    }),
  );
  return nested.flat();
}
