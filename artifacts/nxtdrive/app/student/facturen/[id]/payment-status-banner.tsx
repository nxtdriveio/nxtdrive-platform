"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import type { PaymentReturnStatus } from "@/lib/invoices/payment-return";

export type { PaymentReturnStatus };

/**
 * Post-Mollie return banner. Mollie redirects the student back to this invoice
 * with `?paid=1` regardless of the outcome, and the webhook that confirms the
 * payment server-side can land a moment later. This client banner gives clear,
 * honest feedback and — while the payment is still being processed — quietly
 * re-fetches the page so the confirmation appears without a manual refresh.
 *
 *  - "paid":    webhook landed, invoice is settled → green confirmation.
 *  - "pending": waiting for the webhook → amber "we verwerken je betaling",
 *               auto-polls a bounded number of times.
 *  - "failed":  Mollie reported the payment was cancelled/expired/failed →
 *               neutral notice; the pay options remain available to retry.
 */

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10;

export function PaymentStatusBanner({ status }: { status: PaymentReturnStatus }) {
  const router = useRouter();
  const pollsRef = useRef(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (status !== "pending") return;
    pollsRef.current = 0;
    setTimedOut(false);
    const id = setInterval(() => {
      pollsRef.current += 1;
      if (pollsRef.current > MAX_POLLS) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, router]);

  if (status === "paid") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">Betaling ontvangen — bedankt!</span> Je
          factuur is voldaan.
        </span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">Betaling niet afgerond.</span> Er is niets
          afgeschreven. Je kunt het hieronder opnieuw proberen.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-800 dark:text-sky-300">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
      <span>
        <span className="font-medium">We verwerken je betaling…</span>{" "}
        {timedOut
          ? "Dit duurt langer dan verwacht. Ververs de pagina over een momentje om de status te zien."
          : "Dit kan een moment duren. Deze pagina wordt automatisch bijgewerkt zodra je betaling is bevestigd."}
      </span>
    </div>
  );
}
