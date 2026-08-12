"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Clock3, LockKeyhole, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type {
  AppointmentTypePolicy,
  InstructorAppointmentPreference,
} from "@/domains/planning/domain/appointment-policy";
import { saveInstructorAppointmentPreference } from "./actions";

type Feedback = { tone: "success" | "error"; message: string };

function PreferenceCard({
  policy,
  preference,
  pending,
  feedback,
  onSubmit,
  onReset,
}: {
  policy: AppointmentTypePolicy;
  preference?: InstructorAppointmentPreference;
  pending: boolean;
  feedback?: Feedback;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: (code: AppointmentTypePolicy["code"]) => void;
}) {
  const durationLocked = !policy.instructorCanOverrideDuration;
  const bufferLocked = !policy.instructorCanOverrideBuffer;
  const completelyLocked = durationLocked && bufferLocked;

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-brand-border/80 bg-white/92 shadow-brand-card backdrop-blur dark:bg-card/92">
      <div className="flex items-start gap-3 border-b border-brand-border/70 px-4 py-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-accent text-brand-primary">
          <Clock3 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black text-foreground">{policy.label}</h2>
            {completelyLocked ? (
              <Badge variant="outline">
                <LockKeyhole className="mr-1 h-3 w-3" aria-hidden />
                Rijschoolbeleid
              </Badge>
            ) : preference ? (
              <Badge variant="primary">Persoonlijke voorkeur</Badge>
            ) : (
              <Badge variant="outline">Rijschoolstandaard</Badge>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Standaard {policy.defaultDurationMinutes} min · buffer{" "}
            {policy.defaultBufferBeforeMinutes} min voor en{" "}
            {policy.defaultBufferAfterMinutes} min na
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 p-4">
        <input type="hidden" name="code" value={policy.code} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${policy.code}-duration`}>
              Mijn standaardduur
            </Label>
            {durationLocked ? (
              <div className="flex h-11 items-center rounded-xl border border-brand-border bg-brand-muted/45 px-3 text-sm text-muted-foreground">
                {policy.defaultDurationMinutes} min · ingesteld door rijschool
              </div>
            ) : (
              <Input
                id={`${policy.code}-duration`}
                name="duration_minutes"
                type="number"
                min={policy.minDurationMinutes}
                max={policy.maxDurationMinutes}
                step={policy.durationStepMinutes}
                defaultValue={preference?.durationMinutes ?? ""}
                placeholder={`${policy.defaultDurationMinutes} min`}
                className="h-11 tabular-nums"
              />
            )}
            {!durationLocked ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Leeg = rijschoolstandaard. {policy.minDurationMinutes}–
                {policy.maxDurationMinutes} min, stap{" "}
                {policy.durationStepMinutes}.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${policy.code}-before`}>Mijn buffer voor</Label>
            {bufferLocked ? (
              <div className="flex h-11 items-center rounded-xl border border-brand-border bg-brand-muted/45 px-3 text-sm text-muted-foreground">
                {policy.defaultBufferBeforeMinutes} min · vergrendeld
              </div>
            ) : (
              <Input
                id={`${policy.code}-before`}
                name="buffer_before_minutes"
                type="number"
                min={policy.minBufferBeforeMinutes}
                max={240}
                step={10}
                defaultValue={preference?.bufferBeforeMinutes ?? ""}
                placeholder={`${policy.defaultBufferBeforeMinutes} min`}
                className="h-11 tabular-nums"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${policy.code}-after`}>Mijn buffer na</Label>
            {bufferLocked ? (
              <div className="flex h-11 items-center rounded-xl border border-brand-border bg-brand-muted/45 px-3 text-sm text-muted-foreground">
                {policy.defaultBufferAfterMinutes} min · vergrendeld
              </div>
            ) : (
              <Input
                id={`${policy.code}-after`}
                name="buffer_after_minutes"
                type="number"
                min={policy.minBufferAfterMinutes}
                max={240}
                step={10}
                defaultValue={preference?.bufferAfterMinutes ?? ""}
                placeholder={`${policy.defaultBufferAfterMinutes} min`}
                className="h-11 tabular-nums"
              />
            )}
          </div>
        </div>

        {feedback ? (
          <p
            role="status"
            aria-live="polite"
            className={
              feedback.tone === "success"
                ? "rounded-xl border border-emerald-400/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100"
                : "rounded-xl border border-red-400/40 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/25 dark:text-red-100"
            }
          >
            {feedback.message}
          </p>
        ) : null}

        {!completelyLocked ? (
          <div className="flex flex-wrap justify-end gap-2">
            {preference ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={() => onReset(policy.code)}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Rijschoolstandaard
              </Button>
            ) : null}
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? "Opslaan…" : "Voorkeur opslaan"}
            </Button>
          </div>
        ) : preference ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => onReset(policy.code)}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Oude voorkeur wissen
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

export function InstructorPlanningPreferencesManager({
  policies,
  preferences,
}: {
  policies: readonly AppointmentTypePolicy[];
  preferences: readonly InstructorAppointmentPreference[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const preferenceByCode = new Map(
    preferences.map((preference) => [
      preference.appointmentTypeCode,
      preference,
    ]),
  );

  function run(code: string, formData: FormData) {
    setPendingCode(code);
    setFeedback((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });
    startTransition(async () => {
      const result = await saveInstructorAppointmentPreference(formData);
      setFeedback((current) => ({
        ...current,
        [code]: result.ok
          ? { tone: "success", message: "Planningvoorkeur opgeslagen." }
          : { tone: "error", message: result.error ?? "Opslaan mislukt." },
      }));
      setPendingCode(null);
      if (result.ok) router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(String(formData.get("code") ?? ""), formData);
  }

  function reset(code: AppointmentTypePolicy["code"]) {
    const formData = new FormData();
    formData.set("code", code);
    run(code, formData);
  }

  return (
    <div
      className="grid gap-4 xl:grid-cols-2"
      data-instructor-planning-preferences=""
    >
      {policies
        .filter((policy) => policy.isActive)
        .map((policy) => {
          const preference = preferenceByCode.get(policy.code);
          return (
            <PreferenceCard
              key={`${policy.code}-${preference?.durationMinutes ?? "default"}-${preference?.bufferBeforeMinutes ?? "default"}-${preference?.bufferAfterMinutes ?? "default"}`}
              policy={policy}
              preference={preference}
              pending={pending && pendingCode === policy.code}
              feedback={feedback[policy.code]}
              onSubmit={submit}
              onReset={reset}
            />
          );
        })}
    </div>
  );
}
