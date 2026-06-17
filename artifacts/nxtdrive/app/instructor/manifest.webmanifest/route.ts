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
  const appName = resolveBrandAppName(brandingContext.tenant, "instructor");

  const manifest = {
    id: "/instructor",
    name: appName,
    short_name: brandingContext.whiteLabelActive
      ? brandingContext.brandName
      : "Instructeur",
    description: resolveBrandDescription(brandingContext.tenant, "instructor"),
    lang: "nl",
    dir: "ltr",
    start_url: "/instructor",
    scope: "/instructor",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0F172A",
    theme_color: brandingContext.themeColor,
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
    screenshots: [
      {
        src: "/screenshots/instructor-1.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "Vandaag — dagplanning en waarschuwingen",
      },
      {
        src: "/screenshots/instructor-2.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "Dagplanning en leskaart",
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
