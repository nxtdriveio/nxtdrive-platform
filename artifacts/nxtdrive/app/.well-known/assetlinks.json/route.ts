import { NextResponse } from "next/server";
import {
  buildAndroidAssetLinks,
  parseAndroidSigningFingerprints,
} from "@/lib/android/asset-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const statements = [
    ...buildAndroidAssetLinks(
      "io.nxtdrive.instructeur",
      parseAndroidSigningFingerprints(
        process.env["ANDROID_INSTRUCTOR_APP_SIGNING_SHA256_FINGERPRINTS"],
      ),
    ),
    ...buildAndroidAssetLinks(
      "com.nxtdrive.student",
      parseAndroidSigningFingerprints(
        process.env["ANDROID_STUDENT_APP_SIGNING_SHA256_FINGERPRINTS"],
      ),
    ),
  ];

  return NextResponse.json(statements, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        statements.length > 0
          ? "public, max-age=300, stale-while-revalidate=3600"
          : "no-store, max-age=0",
      "X-NXTDRIVE-Assetlinks-Configured":
        statements.length > 0 ? "true" : "false",
    },
  });
}
