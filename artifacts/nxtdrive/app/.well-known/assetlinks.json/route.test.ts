import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET } from "./route";

const ENV_KEY = "ANDROID_INSTRUCTOR_APP_SIGNING_SHA256_FINGERPRINTS";
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

test("assetlinks never publishes placeholder signing fingerprints", async () => {
  delete process.env[ENV_KEY];
  const response = GET();
  const body = await response.json();

  assert.deepEqual(body, []);
  assert.equal(
    response.headers.get("X-NXTDRIVE-Assetlinks-Configured"),
    "false",
  );
});

test("assetlinks publishes the canonical instructor package with a valid fingerprint", async () => {
  process.env[ENV_KEY] = Array.from({ length: 32 }, () => "AB").join(":");
  const response = GET();
  const body = await response.json();

  assert.equal(body[0].target.package_name, "io.nxtdrive.instructeur");
  assert.equal(body[0].target.sha256_cert_fingerprints.length, 1);
  assert.equal(
    response.headers.get("X-NXTDRIVE-Assetlinks-Configured"),
    "true",
  );
});
