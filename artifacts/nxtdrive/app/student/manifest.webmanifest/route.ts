import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  getBrandingContextByHost,
  resolveBrandAppName,
  resolveBrandDescription,
} from "@/lib/branding";

export async function GET() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const brandingContext = await getBrandingContextByHost(host);
  const appName = resolveBrandAppName(brandingContext.tenant, "student");

  const manifest = {
    id: "/student",
    name: appName,
    short_name: brandingContext.whiteLabelActive
      ? brandingContext.brandName
      : "Leerling",
    description: resolveBrandDescription(brandingContext.tenant, "student"),
    lang: "nl",
    dir: "ltr",
    start_url: "/student",
    scope: "/student",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F172A",
    theme_color: brandingContext.themeColor,
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
    screenshots: [
      {
        src: "/screenshots/student-1.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "Home — volgende les, tegoed en voortgang",
      },
      {
        src: "/screenshots/student-2.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "Voortgang en lessen",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "Vary": "Host, X-Forwarded-Host",
    },
  });
}
