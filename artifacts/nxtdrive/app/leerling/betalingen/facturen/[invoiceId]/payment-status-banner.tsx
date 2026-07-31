"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { StudentShowcaseNotice } from "@/components/student/Showcase";
import type { PaymentReturnStatus } from "@/lib/invoices/payment-return";

export type { PaymentReturnStatus };

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
      <StudentShowcaseNotice
        tone="success"
        icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
        title="Betaling ontvangen"
        description="Bedankt! Je factuur is voldaan en je dossier is meteen bijgewerkt."
      />
    );
  }

  if (status === "failed") {
    return (
      <StudentShowcaseNotice
        tone="warning"
        icon={<AlertCircle className="h-5 w-5" aria-hidden />}
        title="Betaling niet afgerond"
        description="Er is niets afgeschreven. Je kunt het hieronder opnieuw proberen wanneer je wilt."
      />
    );
  }

  return (
    <StudentShowcaseNotice
      tone="info"
      icon={<Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      title="We verwerken je betaling"
      description={
        timedOut
          ? "Dit duurt langer dan verwacht. Ververs de pagina over een momentje om de nieuwste status te zien."
          : "Dit kan een moment duren. Deze pagina wordt automatisch bijgewerkt zodra je betaling is bevestigd."
      }
    />
  );
}
