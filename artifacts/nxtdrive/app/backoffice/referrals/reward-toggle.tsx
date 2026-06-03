"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setReferralRewardHandled } from "../instellingen/actions";

/**
 * Task #113 — handmatige beloningsafhandeling per referral-lead. Bewust géén
 * automatische beloningsmotor: een admin vinkt de beloning zelf af. De locked
 * RPC (admin-only, geaudit) is de enige schrijfweg.
 */
export function RewardToggle({
  leadId,
  handled,
}: {
  leadId: string;
  handled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await setReferralRewardHandled(leadId, !handled);
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={handled ? "outline" : "primary"}
        onClick={toggle}
        disabled={pending}
      >
        {handled ? (
          <>
            <Check className="h-4 w-4" aria-hidden />
            Beloning afgehandeld
          </>
        ) : (
          "Markeer als afgehandeld"
        )}
      </Button>
      {error ? (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : null}
    </div>
  );
}
