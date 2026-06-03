import { NextResponse } from "next/server";

/**
 * Per-app PWA manifest for the NXTDRIVE Leerling app (Task #177).
 *
 * Served as its own route handler (not the generic /manifest.webmanifest) so
 * the student app installs as a distinct, portrait-first PWA / TWA with its own
 * identity (`id`), start_url, icons and orientation — independent from the
 * instructor app. Values follow docs/NXTDRIVE_PWA_CANON.md (navy #0F172A
 * theme/background, standalone, portrait).
 *
 * White-label note: this is the default NXTDRIVE-branded manifest. White-label
 * manifest variants only activate when a tenant has `white_label_enabled = true`
 * (out of scope here — architecture stays single-manifest until then).
 */
const manifest = {
  id: "/student",
  name: "NXTDRIVE Leerling",
  short_name: "Leerling",
  description:
    "Jouw rijopleiding in één overzicht — lessen, tegoed, voortgang en meer.",
  lang: "nl",
  dir: "ltr",
  start_url: "/student",
  scope: "/student",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0F172A",
  theme_color: "#0F172A",
  categories: ["education", "productivity"],
  icons: [
    {
      src: "/icons/student-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/student-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/student-maskable-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/student-maskable-512.png",
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
