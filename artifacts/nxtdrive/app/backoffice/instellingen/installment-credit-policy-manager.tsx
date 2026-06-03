"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_INSTALLMENT_CREDIT_POLICY,
  INSTALLMENT_CREDIT_MODE_HINT,
  INSTALLMENT_CREDIT_MODE_LABEL,
  type InstallmentCreditMode,
  type InstallmentCreditPolicy,
} from "@/lib/invoices/installment-credit";
import {
  saveInstallmentCreditPolicy,
  resetInstallmentCreditPolicy,
} from "./actions";

const MODES: InstallmentCreditMode[] = ["per_installment", "immediate"];

export function InstallmentCreditPolicyManager({
  policy,
}: {
  policy: InstallmentCreditPolicy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<InstallmentCreditMode>(policy.mode);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function onSave() {
    const fd = new FormData();
    fd.set("mode", mode);
    run(() => saveInstallmentCreditPolicy(fd));
  }

  function onReset() {
    run(async () => {
      const res = await resetInstallmentCreditPolicy();
      if (res.ok) setMode(DEFAULT_INSTALLMENT_CREDIT_POLICY.mode);
      return res;
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Bepaal wanneer het tegoed van een pakket beschikbaar komt bij een
        termijnschema. Deze keuze wordt vastgelegd op het moment dat een
        termijnschema wordt aangemaakt — bestaande schema&apos;s behouden hun
        eerder gekozen beleid.
      </p>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Vrijgavebeleid opgeslagen.
        </p>
      ) : null}

      <div className="space-y-2">
        {MODES.map((m) => {
          const selected = mode === m;
          return (
            <label
              key={m}
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/60"
              }`}
            >
              <input
                type="radio"
                name="installment_credit_mode"
                value={m}
                checked={selected}
                onChange={() => setMode(m)}
                className="mt-1 h-4 w-4 accent-[var(--primary)]"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-foreground">
                  {INSTALLMENT_CREDIT_MODE_LABEL[m]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {INSTALLMENT_CREDIT_MODE_HINT[m]}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSave}>
          Vrijgavebeleid opslaan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onReset}
        >
          Terug naar standaard
        </Button>
      </div>
    </div>
  );
}
