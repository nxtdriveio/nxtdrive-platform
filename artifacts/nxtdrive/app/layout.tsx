import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import {
  getBrandingContextByHost,
  resolveBrandDescription,
} from "@/lib/branding";
import { getTheme } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const brandingContext = await getBrandingContextByHost(host);

  return {
    title: brandingContext.brandName,
    description: resolveBrandDescription(brandingContext.tenant, "platform"),
    manifest: "/manifest.webmanifest",
    applicationName: brandingContext.brandName,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const brandingContext = await getBrandingContextByHost(host);

  return {
    themeColor: brandingContext.themeColor,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();

  return (
    <html lang="nl" data-theme={theme} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
