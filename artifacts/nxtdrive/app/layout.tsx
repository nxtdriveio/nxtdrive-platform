import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NXTDRIVE",
  description: "Het complete platform voor rijscholen — van eerste lead tot geslaagd examen.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
