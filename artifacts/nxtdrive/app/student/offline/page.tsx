"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { BrandLogo } from "@/components/pwa/BrandLogo";
import {
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { PWAPage } from "@/components/pwa/primitives";

export default function StudentOfflinePage() {
  return (
    <PWAPage
      app="student"
      contentClassName="flex min-h-[70vh] flex-col items-center justify-center"
    >
      <div className="w-full max-w-md space-y-4">
        <StudentShowcaseCard
          style={{
            background:
              "linear-gradient(135deg, var(--brand-gradient-start), var(--brand-gradient-mid) 58%, var(--brand-gradient-end))",
          }}
        >
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04] text-primary">
              <BrandLogo className="h-10 w-10" />
            </div>
            <div className="flex items-center gap-2 text-xs uppercase text-white/42">
              <WifiOff className="h-4 w-4" aria-hidden />
              Je bent offline
            </div>
            <h1 className="text-2xl font-black text-white">
              NXTDRIVE leerlingapp
            </h1>
            <p className="max-w-xs text-sm leading-6 text-white/58">
              We kunnen je gegevens nu niet laden. Zodra je weer internet hebt,
              ben je direct weer up-to-date.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Opnieuw proberen
            </button>
          </div>
        </StudentShowcaseCard>

        <StudentShowcaseNotice
          title="Tip"
          description="Je laatst geladen planning kan nog zichtbaar zijn op de vorige pagina."
        />
      </div>
    </PWAPage>
  );
}
