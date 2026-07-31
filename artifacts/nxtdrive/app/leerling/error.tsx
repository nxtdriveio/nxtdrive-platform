"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[leerling] route render failed", error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto max-w-xl rounded-[1.5rem] border border-rose-400/25 bg-white/[0.05] p-6 text-white"
    >
      <AlertTriangle className="h-6 w-6 text-rose-300" aria-hidden />
      <h1 className="mt-3 text-xl font-black">
        Gegevens konden niet worden geladen
      </h1>
      <p className="mt-2 text-sm leading-6 text-white/62">
        Dit is een laadfout, geen lege lijst. Probeer het opnieuw; je gegevens
        zijn niet verwijderd.
      </p>
      <Button type="button" onClick={reset} className="mt-4">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Opnieuw proberen
      </Button>
    </section>
  );
}
