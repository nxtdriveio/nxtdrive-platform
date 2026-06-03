import type { Metadata, Viewport } from "next";
import { getTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "NXTDRIVE",
  description:
    "Het complete platform voor rijscholen — van eerste lead tot geslaagd examen.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#6b4eff",
};

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
