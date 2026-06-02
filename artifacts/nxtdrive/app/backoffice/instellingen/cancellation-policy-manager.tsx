"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/lessons/cancellation-policy";
import type { CancellationPolicy } from "@/lib/lessons/types";
import {
  saveCancellationPolicy,
  resetCancellationPolicy,
} from "./actions";

type Row = { hours_before: string; refund_pct: string };

function toRows(policy: CancellationPolicy): Row[] {
  return policy.tiers.map((t) => ({
    hours_before: String(t.hours_before),
    refund_pct: String(t.refund_pct),
  }));
}

export function CancellationPolicyManager({
  policy,
}: {
  policy: CancellationPolicy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [rows, setRows] = useState<Row[]>(() => toRows(policy));
  const [minNotice, setMinNotice] = useState(String(policy.min_notice_hours));

  const parsed = rows.map((r) => ({
    h: Number(r.hours_before),
    p: Number(r.refund_pct),
  }));
  const hasEmpty = rows.some(
    (r) => r.hours_before.trim() === "" || r.refund_pct.trim() === "",
  );
  const hasBadNum = parsed.some(
    ({ h, p }) => !Number.isFinite(h) || !Number.isFinite(p),
  );
  const hasBadRange = parsed.some(
    ({ h, p }) => h < 0 || p < 0 || p > 100,
  );
  const roundedHours = parsed
    .map(({ h }) => Math.round(h))
    .filter((h) => Number.isFinite(h));
  const hasDup = new Set(roundedHours).size !== roundedHours.length;
  const minNoticeNum = Number(minNotice);
  const minNoticeBad =
    minNotice.trim() !== "" &&
    (!Number.isFinite(minNoticeNum) || minNoticeNum < 0);

  function validationMessage(): string | null {
    if (hasEmpty) return "Vul elk veld in of verwijder de regel.";
    if (hasBadNum) return "Gebruik geldige getallen voor elke regel.";
    if (hasBadRange)
      return "Uur vooraf moet 0 of hoger zijn en het percentage tussen 0 en 100.";
    if (hasDup) return "Twee regels hebben hetzelfde aantal uur vooraf.";
    if (minNoticeBad) return "De minimale opzegtermijn moet 0 of hoger zijn.";
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
    const tiers = parsed.map(({ h, p }) => ({
      hours_before: Math.round(h),
      refund_pct: Math.round(p),
    }));
    const fd = new FormData();
    fd.set("tiers", JSON.stringify(tiers));
    fd.set("min_notice_hours", minNotice.trim() === "" ? "0" : minNotice);
    run(() => saveCancellationPolicy(fd));
  }

  function onReset() {
    run(async () => {
      const res = await resetCancellationPolicy();
      if (res.ok) {
        setRows(toRows(DEFAULT_CANCELLATION_POLICY));
        setMinNotice(String(DEFAULT_CANCELLATION_POLICY.min_notice_hours));
      }
      return res;
    });
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, { hours_before: "", refund_pct: "" }]);
  }

  function removeRow(index: number) {
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Bepaal hoeveel tegoed een leerling terugkrijgt bij annuleren, afhankelijk
        van hoeveel uur vooraf de les wordt afgezegd. De drempel met het hoogste
        aantal uur vooraf die nog haalbaar is, telt; valt de afzegging onder de
        laagste drempel, dan is er geen refund (0%). Dit beleid wordt direct
        toegepast bij annuleren in de agenda.
      </p>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Annuleringsbeleid opgeslagen.
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          Refund-drempels
        </p>
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              Geen drempels ingesteld — er wordt nooit tegoed teruggestort (0%).
            </p>
          ) : null}
          {rows.map((row, index) => (
            <div
              key={index}
              className="flex flex-wrap items-end gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`hours_${index}`} className="text-xs">
                  Vanaf (uur vooraf)
                </Label>
                <Input
                  id={`hours_${index}`}
                  type="number"
                  min={0}
                  max={8760}
                  value={row.hours_before}
                  onChange={(e) =>
                    updateRow(index, { hours_before: e.target.value })
                  }
                  className="w-28 text-right tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`pct_${index}`} className="text-xs">
                  Refund (%)
                </Label>
                <Input
                  id={`pct_${index}`}
                  type="number"
                  min={0}
                  max={100}
                  value={row.refund_pct}
                  onChange={(e) =>
                    updateRow(index, { refund_pct: e.target.value })
                  }
                  className="w-28 text-right tabular-nums"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto text-muted-foreground hover:text-danger"
                onClick={() => removeRow(index)}
                aria-label="Drempel verwijderen"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={addRow}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Drempel toevoegen
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="min_notice_hours">Minimale opzegtermijn (uur)</Label>
        <Input
          id="min_notice_hours"
          type="number"
          min={0}
          max={8760}
          value={minNotice}
          onChange={(e) => setMinNotice(e.target.value)}
          className="w-40 tabular-nums"
        />
        <p className="text-xs text-muted-foreground">
          Hoeveel uur vooraf een leerling zelf minimaal mag afzeggen. 0 = geen
          minimum.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSave}>
          Annuleringsbeleid opslaan
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
