"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_LEAD_SCORE_POLICY,
  LEAD_SCORE_WEIGHT_CODES,
  LEAD_SCORE_WEIGHT_LABEL,
  type LeadScorePolicy,
} from "@/lib/leads/lead-score";
import { saveLeadScorePolicy, resetLeadScorePolicy } from "./actions";

const MIN_WEIGHT = 0;
const MAX_WEIGHT = 50;

export function LeadScorePolicyManager({
  policy,
}: {
  policy: LeadScorePolicy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      LEAD_SCORE_WEIGHT_CODES.map((code) => [
        code,
        String(
          policy.weights[code] ?? DEFAULT_LEAD_SCORE_POLICY.weights[code] ?? 0,
        ),
      ]),
    ),
  );
  const [warm, setWarm] = useState(String(policy.bands.warm));
  const [hot, setHot] = useState(String(policy.bands.hot));

  const warmNum = Number(warm);
  const hotNum = Number(hot);
  const bandsInvalid =
    Number.isFinite(warmNum) && Number.isFinite(hotNum) && warmNum > hotNum;

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
    if (bandsInvalid) {
      setError("De warm-drempel mag niet hoger zijn dan de hot-drempel.");
      return;
    }
    const fd = new FormData();
    for (const code of LEAD_SCORE_WEIGHT_CODES) {
      fd.set(`weight_${code}`, weights[code] ?? "");
    }
    fd.set("band_warm", warm);
    fd.set("band_hot", hot);
    run(() => saveLeadScorePolicy(fd));
  }

  function onReset() {
    run(async () => {
      const res = await resetLeadScorePolicy();
      if (res.ok) {
        setWeights(
          Object.fromEntries(
            LEAD_SCORE_WEIGHT_CODES.map((code) => [
              code,
              String(DEFAULT_LEAD_SCORE_POLICY.weights[code] ?? 0),
            ]),
          ),
        );
        setWarm(String(DEFAULT_LEAD_SCORE_POLICY.bands.warm));
        setHot(String(DEFAULT_LEAD_SCORE_POLICY.bands.hot));
      }
      return res;
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Bepaal hoeveel punten elke eigenschap van een lead oplevert (0–50) en
        vanaf welke score een lead warm of hot is (0–100). De voorwaarden zelf
        liggen vast; alleen het gewicht en de drempels stel je hier in. De
        scores in het leaddashboard en de KPI “Hot” passen zich direct aan.
      </p>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Scoreregels opgeslagen.
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Gewichten</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LEAD_SCORE_WEIGHT_CODES.map((code) => (
            <div
              key={code}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <Label htmlFor={`weight_${code}`} className="text-sm">
                {LEAD_SCORE_WEIGHT_LABEL[code] ?? code}
              </Label>
              <Input
                id={`weight_${code}`}
                type="number"
                min={MIN_WEIGHT}
                max={MAX_WEIGHT}
                value={weights[code] ?? ""}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, [code]: e.target.value }))
                }
                className="w-20 text-right tabular-nums"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Drempels</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="band_warm">Warm vanaf</Label>
            <Input
              id="band_warm"
              type="number"
              min={0}
              max={100}
              value={warm}
              onChange={(e) => setWarm(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="band_hot">Hot vanaf</Label>
            <Input
              id="band_hot"
              type="number"
              min={0}
              max={100}
              value={hot}
              onChange={(e) => setHot(e.target.value)}
            />
          </div>
        </div>
        {bandsInvalid ? (
          <p className="mt-2 text-xs text-danger">
            De warm-drempel mag niet hoger zijn dan de hot-drempel.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSave}>
          Scoreregels opslaan
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
