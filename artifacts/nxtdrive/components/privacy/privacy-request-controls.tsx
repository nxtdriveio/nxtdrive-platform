"use client";

import { useState } from "react";

type RequestType = "DATA_EXPORT" | "ACCOUNT_DELETION";

export function PrivacyRequestControls({
  allowDeletion = false,
}: {
  allowDeletion?: boolean;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<RequestType | null>(null);

  async function submit(requestType: RequestType) {
    setBusy(requestType);
    setStatus(null);
    try {
      const response = await fetch("/api/privacy/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ requestType }),
      });
      const result = (await response.json()) as {
        id?: string;
        error?: string;
      };
      setStatus(
        response.ok
          ? `Verzoek ontvangen. Referentie: ${result.id ?? "onbekend"}.`
          : result.error ?? "Het verzoek kon niet worden opgeslagen.",
      );
    } catch {
      setStatus("De verbinding is verbroken. Probeer het later opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void submit("DATA_EXPORT")}
        disabled={busy !== null}
        className="min-h-11 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {busy === "DATA_EXPORT"
          ? "Export aanvragen…"
          : "Data-export aanvragen"}
      </button>
      {allowDeletion ? (
        <button
          type="button"
          onClick={() => void submit("ACCOUNT_DELETION")}
          disabled={busy !== null}
          className="ml-0 min-h-11 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 sm:ml-2"
        >
          {busy === "ACCOUNT_DELETION"
            ? "Verzoek opslaan…"
            : "Verwijderingsverzoek indienen"}
        </button>
      ) : null}
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
