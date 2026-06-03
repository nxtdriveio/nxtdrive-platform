import { NextResponse } from "next/server";

/**
 * Per-app PWA manifest for the NXTDRIVE Instructeur app (Task #177).
 *
 * Distinct from the student manifest so the instructor app installs as its own
 * landscape-first, tablet-oriented PWA / TWA with a separate `id`, start_url and
 * icon set. Values follow docs/NXTDRIVE_PWA_CANON.md (navy #0F172A
 * theme/background, standalone, landscape).
 *
 * White-label variants only activate when `white_label_enabled = true` (out of
 * scope here).
 */
const manifest = {
  id: "/instructor",
  name: "NXTDRIVE Instructeur",
  short_name: "Instructeur",
  description:
    "Vandaag slim en overzichtelijk lesgeven — planning, leerlingen en lessen.",
  lang: "nl",
  dir: "ltr",
  start_url: "/instructor",
  scope: "/instructor",
  display: "standalone",
  orientation: "landscape",
  background_color: "#0F172A",
  theme_color: "#0F172A",
  categories: ["education", "productivity"],
  icons: [
    {
      src: "/icons/instructor-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/instructor-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/instructor-maskable-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/instructor-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export function GET() {
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
