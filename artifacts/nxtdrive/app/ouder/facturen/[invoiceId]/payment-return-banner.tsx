"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { PaymentReturnStatus } from "@/lib/invoices/payment-return";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10;

export function ParentPaymentReturnBanner({
  status,
}: {
  status: PaymentReturnStatus;
}) {
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

  const config =
    status === "paid"
      ? {
          icon: CheckCircle2,
          title: "Betaling ontvangen",
          body: "De factuur is voldaan en het leerlingdossier is bijgewerkt.",
          className:
            "border-success/30 bg-[color-mix(in_oklab,var(--success)_10%,transparent)] text-success",
        }
      : status === "failed"
        ? {
            icon: AlertCircle,
            title: "Betaling niet afgerond",
            body: "Er is niets afgeschreven. Je kunt de betaling opnieuw starten.",
            className:
              "border-warning/30 bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] text-warning",
          }
        : {
            icon: Loader2,
            title: "We verwerken de betaling",
            body: timedOut
              ? "Dit duurt langer dan verwacht. Ververs de pagina over een moment om de nieuwste status te zien."
              : "Deze pagina wordt automatisch bijgewerkt zodra de betaalprovider de betaling heeft bevestigd.",
            className:
              "border-info/30 bg-[color-mix(in_oklab,var(--info)_10%,transparent)] text-info",
          };
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border px-4 py-3 ${config.className}`}>
      <div className="flex gap-3">
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${status === "pending" ? "animate-spin" : ""}`}
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold">{config.title}</p>
          <p className="mt-1 text-sm text-foreground/70">{config.body}</p>
        </div>
      </div>
    </div>
  );
}
