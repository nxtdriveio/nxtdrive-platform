import { NextResponse } from "next/server";

const SHA256_FINGERPRINT = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

function fingerprintsFromEnvironment(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => SHA256_FINGERPRINT.test(value));
}

export function GET() {
  const packages = [
    {
      packageName: "io.nxtdrive.instructeur",
      fingerprints: fingerprintsFromEnvironment(
        "ANDROID_INSTRUCTOR_APP_SIGNING_SHA256_FINGERPRINTS",
      ),
    },
    {
      packageName: "com.nxtdrive.student",
      fingerprints: fingerprintsFromEnvironment(
        "ANDROID_STUDENT_APP_SIGNING_SHA256_FINGERPRINTS",
      ),
    },
  ];
  const statements = packages
    .filter(({ fingerprints }) => fingerprints.length > 0)
    .map(({ packageName, fingerprints }) => ({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    }));

  return NextResponse.json(statements, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Required by the Digital Asset Links spec — the file must not be sniffed
      // into another content type.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600",
      "X-NXTDRIVE-Assetlinks-Configured":
        statements.length > 0 ? "true" : "false",
    },
  });
}
