import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInstructorAssetLinks,
  parseAndroidSigningFingerprints,
} from "./asset-links";

const fingerprint =
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:" +
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

test("asset links normalize and deduplicate Play signing fingerprints", () => {
  assert.deepEqual(
    parseAndroidSigningFingerprints(
      `${fingerprint}, ${fingerprint.toLowerCase()} invalid`,
    ),
    [fingerprint],
  );
});

test("asset links expose only the production instructor package", () => {
  assert.deepEqual(buildInstructorAssetLinks([fingerprint]), [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "io.nxtdrive.instructeur",
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ]);
  assert.deepEqual(buildInstructorAssetLinks([]), []);
});
