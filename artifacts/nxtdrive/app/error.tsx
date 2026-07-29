"use client";

import { useEffect } from "react";

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reference = error.digest ?? "onbekend";

  useEffect(() => {
    console.error(
      JSON.stringify({
        severityText: "ERROR",
        event: "ui.error_boundary",
        reference,
      }),
    );
  }, [reference]);

  return (
    <main
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6"
      role="alert"
    >
      <p className="text-sm font-semibold text-primary">Er ging iets mis</p>
      <h1 className="mt-2 text-2xl font-semibold">
        Deze pagina kon niet worden geladen
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Probeer het opnieuw. Blijft dit gebeuren, geef dan referentie{" "}
        <span className="font-mono">{reference}</span> door aan support.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-11 self-start rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Opnieuw proberen
      </button>
    </main>
  );
}
