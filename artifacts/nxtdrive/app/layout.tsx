import type { Metadata } from "next";
import { getTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "NXTDRIVE",
  description:
    "Het complete platform voor rijscholen — van eerste lead tot geslaagd examen.",
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
