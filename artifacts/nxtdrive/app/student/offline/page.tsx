"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { BrandLogo } from "@/components/pwa/BrandLogo";
import { PWAPage } from "@/components/pwa/primitives";

export default function StudentOfflinePage() {
  return (
    <PWAPage contentClassName="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-950 px-8 py-10 text-white shadow-xl">
        <BrandLogo className="h-12 w-12" />
        <div className="flex items-center gap-2 text-white/80">
          <WifiOff className="h-5 w-5" aria-hidden />
          <span className="text-sm font-medium">Je bent offline</span>
        </div>
        <h1 className="text-xl font-semibold">NXTDRIVE Leerling</h1>
        <p className="max-w-xs text-sm text-white/70">
          We kunnen je gegevens nu niet laden. Zodra je weer internet hebt, ben
          je direct weer up-to-date.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-white/90"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Opnieuw proberen
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: je laatst geladen planning kan al zichtbaar zijn op de vorige pagina.
      </p>
    </PWAPage>
  );
}
