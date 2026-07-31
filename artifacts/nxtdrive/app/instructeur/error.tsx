"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InstructorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[instructeur] route render failed", error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto max-w-2xl rounded-[1.5rem] border border-danger/25 bg-white p-6 shadow-brand-card"
    >
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
      <h1 className="mt-3 text-xl font-black text-foreground">
        Gegevens konden niet worden geladen
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Dit is een laadfout, geen lege agenda of lege lijst. Probeer de route
        opnieuw; bestaande gegevens zijn niet verwijderd.
      </p>
      <Button type="button" onClick={reset} className="mt-4">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Opnieuw proberen
      </Button>
    </section>
  );
}
