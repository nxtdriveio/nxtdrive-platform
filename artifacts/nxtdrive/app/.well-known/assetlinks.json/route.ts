import { NextResponse } from "next/server";

/**
 * Digital Asset Links for Google Play Trusted Web Activity (TWA) — Task #177.
 *
 * Android verifies app ⇄ origin ownership by fetching
 *   https://<domain>/.well-known/assetlinks.json
 * and matching the TWA's signing-key SHA-256 fingerprint against an entry here.
 * Once verified, the TWA runs the PWA full-screen (no browser URL bar).
 *
 * HOW TO FILL THE FINGERPRINTS (see docs/GOOGLE_PLAY_PUBLISHING.md for detail):
 *   1. After the first upload to the Google Play Console, open
 *      Release → Setup → App integrity → App signing.
 *   2. Copy the "SHA-256 certificate fingerprint" (the colon-separated hex
 *      string) for EACH app (student + instructor).
 *   3. Replace the PLACEHOLDER strings below with those fingerprints.
 *   4. Redeploy. Re-verify with Google's statement-list tester.
 *
 * NOTE: the fingerprints below are placeholders. They are intentionally NOT real
 * — the production signing key only exists after the first Play upload, so they
 * cannot be filled in from Replit (see task "Out of scope").
 */
const PLACEHOLDER_FINGERPRINT =
  "REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE";

const statements = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.nxtdrive.student",
      sha256_cert_fingerprints: [PLACEHOLDER_FINGERPRINT],
    },
  },
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.nxtdrive.instructor",
      sha256_cert_fingerprints: [PLACEHOLDER_FINGERPRINT],
    },
  },
];

export function GET() {
  return NextResponse.json(statements, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Required by the Digital Asset Links spec — the file must not be sniffed
      // into another content type.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
