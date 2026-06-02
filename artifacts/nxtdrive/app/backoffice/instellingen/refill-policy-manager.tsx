"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_REFILL_POLICY,
  type RefillPolicy,
} from "@/lib/lesson-refill/policy";
import { saveRefillPolicy, resetRefillPolicy } from "./actions";

export function RefillPolicyManager({ policy }: { policy: RefillPolicy }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(policy.enabled);
  const [validMinutes, setValidMinutes] = useState(
    String(policy.valid_minutes),
  );
  const [maxCandidates, setMaxCandidates] = useState(
    String(policy.max_candidates),
  );

  const validNum = Number(validMinutes);
  const maxNum = Number(maxCandidates);
  const validBad =
    validMinutes.trim() === "" ||
    !Number.isFinite(validNum) ||
    validNum < 15 ||
    validNum > 20160;
  const maxBad =
    maxCandidates.trim() === "" ||
    !Number.isFinite(maxNum) ||
    maxNum < 1 ||
    maxNum > 20;

  function validationMessage(): string | null {
    if (validBad)
      return "Geldigheid moet tussen 15 en 20160 minuten (14 dagen) liggen.";
    if (maxBad) return "Max. gelijktijdige uitnodigingen moet tussen 1 en 20 liggen.";
    return null;
  }

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
    const msg = validationMessage();
    if (msg) {
      setError(msg);
      return;
    }
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("valid_minutes", validMinutes);
    fd.set("max_candidates", maxCandidates);
    run(() => saveRefillPolicy(fd));
  }

  function onReset() {
    run(async () => {
      const res = await resetRefillPolicy();
      if (res.ok) {
        setEnabled(DEFAULT_REFILL_POLICY.enabled);
        setValidMinutes(String(DEFAULT_REFILL_POLICY.valid_minutes));
        setMaxCandidates(String(DEFAULT_REFILL_POLICY.max_candidates));
      }
      return res;
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Bij een vrijgekomen lesmoment kun je leerlingen die zich beschikbaar
        hebben gesteld uitnodigen. Zij bevestigen zelf in de app — er wordt nooit
        automatisch geboekt. Bepaal hier of dit aanstaat, hoe lang een
        uitnodiging geldig blijft en hoeveel leerlingen je tegelijk voor één
        moment mag uitnodigen.
      </p>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Herbezet-instellingen opgeslagen.
        </p>
      ) : null}

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm font-medium text-foreground">
          Herbezet-uitnodigingen inschakelen
        </span>
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="valid_minutes">Geldigheid (minuten)</Label>
        <Input
          id="valid_minutes"
          type="number"
          min={15}
          max={20160}
          value={validMinutes}
          onChange={(e) => setValidMinutes(e.target.value)}
          className="w-40 tabular-nums"
          disabled={!enabled}
        />
        <p className="text-xs text-muted-foreground">
          Hoe lang een uitnodiging openstaat voordat deze verloopt. Standaard
          1440 (24 uur).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="max_candidates">Max. gelijktijdige uitnodigingen</Label>
        <Input
          id="max_candidates"
          type="number"
          min={1}
          max={20}
          value={maxCandidates}
          onChange={(e) => setMaxCandidates(e.target.value)}
          className="w-40 tabular-nums"
          disabled={!enabled}
        />
        <p className="text-xs text-muted-foreground">
          Hoeveel leerlingen tegelijk een openstaande uitnodiging voor hetzelfde
          moment mogen hebben.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSave}>
          Herbezet-instellingen opslaan
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
