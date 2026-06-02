"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PAYMENT_REMINDER_POLICY,
  type PaymentReminderPolicy,
} from "@/lib/invoices/payment-reminder-policy";
import {
  savePaymentReminderPolicy,
  resetPaymentReminderPolicy,
} from "./actions";

export function PaymentReminderManager({
  policy,
}: {
  policy: PaymentReminderPolicy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(policy.enabled);
  const [rows, setRows] = useState<string[]>(() =>
    policy.days.map((d) => String(d)),
  );

  const parsed = rows.map((r) => Number(r));
  const hasEmpty = rows.some((r) => r.trim() === "");
  const hasBadNum = parsed.some((n) => !Number.isFinite(n));
  const hasBadRange = parsed.some((n) => n < 1 || n > 365);
  const rounded = parsed.map((n) => Math.round(n)).filter(Number.isFinite);
  const hasDup = new Set(rounded).size !== rounded.length;

  function validationMessage(): string | null {
    if (enabled && rows.length === 0)
      return "Voeg minstens één herinneringsmoment toe of schakel herinneringen uit.";
    if (hasEmpty) return "Vul elk veld in of verwijder de regel.";
    if (hasBadNum) return "Gebruik geldige getallen voor elk moment.";
    if (hasBadRange) return "Dagen na vervaldatum moeten tussen 1 en 365 liggen.";
    if (hasDup) return "Twee momenten hebben hetzelfde aantal dagen.";
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
    const days = rounded.slice().sort((a, b) => a - b);
    const fd = new FormData();
    fd.set("enabled", enabled ? "true" : "false");
    fd.set("days", JSON.stringify(days));
    run(() => savePaymentReminderPolicy(fd));
  }

  function onReset() {
    run(async () => {
      const res = await resetPaymentReminderPolicy();
      if (res.ok) {
        setEnabled(DEFAULT_PAYMENT_REMINDER_POLICY.enabled);
        setRows(DEFAULT_PAYMENT_REMINDER_POLICY.days.map((d) => String(d)));
      }
      return res;
    });
  }

  function updateRow(index: number, value: string) {
    setRows((rs) => rs.map((r, i) => (i === index ? value : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, ""]);
  }

  function removeRow(index: number) {
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Stuur automatisch betaalherinneringen voor openstaande facturen waarvan
        de vervaldatum is verstreken. Elk moment is het aantal dagen ná de
        vervaldatum. Een herinnering wordt per factuur en moment maar één keer
        verstuurd.
      </p>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Betaalherinneringen opgeslagen.
        </p>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="font-medium text-foreground">
          Betaalherinneringen inschakelen
        </span>
      </label>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          Herinneringsmomenten (dagen na vervaldatum)
        </p>
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              Geen momenten ingesteld — er worden geen herinneringen verstuurd.
            </p>
          ) : null}
          {rows.map((row, index) => (
            <div
              key={index}
              className="flex flex-wrap items-end gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`day_${index}`} className="text-xs">
                  Dagen na vervaldatum
                </Label>
                <Input
                  id={`day_${index}`}
                  type="number"
                  min={1}
                  max={365}
                  value={row}
                  disabled={!enabled}
                  onChange={(e) => updateRow(index, e.target.value)}
                  className="w-32 text-right tabular-nums"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto text-muted-foreground hover:text-danger"
                onClick={() => removeRow(index)}
                aria-label="Moment verwijderen"
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
          disabled={!enabled}
          onClick={addRow}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Moment toevoegen
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSave}>
          Betaalherinneringen opslaan
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
