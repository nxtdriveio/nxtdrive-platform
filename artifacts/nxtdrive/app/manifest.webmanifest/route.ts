import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  getBrandingContextByHost,
  resolveBrandDescription,
} from "@/lib/branding";

export async function GET() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const brandingContext = await getBrandingContextByHost(host);

  const manifest = {
    id: "/",
    name: brandingContext.brandName,
    short_name: brandingContext.brandName,
    description: resolveBrandDescription(brandingContext.tenant, "platform"),
    lang: "nl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08080f",
    theme_color: brandingContext.themeColor,
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

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "Vary": "Host, X-Forwarded-Host",
    },
  });
}
