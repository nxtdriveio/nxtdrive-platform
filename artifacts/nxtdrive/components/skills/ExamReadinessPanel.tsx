"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, AlertTriangle, Info } from "lucide-react";
import {
  ADVICE_LABELS,
  PHASE_LABELS,
  type ReadinessResult,
} from "@workspace/leskaart";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { setStudentCbrStatusAction } from "@/app/instructor/actions";
import {
  MACHTIGING_STATUSES,
  MACHTIGING_STATUS_LABEL,
  type MachtigingStatus,
} from "@/lib/cbr/types";

type Preconditions = {
  theorieBehaald: boolean;
  machtigingStatus: MachtigingStatus;
  gezondheidsverklaringVereist: boolean;
  gezondheidsverklaringGeregeld: boolean;
};

const adviceVariant = {
  examenwaardig: "success",
  bijna_examenrijp: "warning",
  niet_examenrijp: "danger",
} as const;

/** Advisory exam-readiness verdict (L1) + instructor-editable preconditions. */
export function ExamReadinessPanel({
  studentId,
  readiness,
  machtigingStatus,
}: {
  studentId: string;
  readiness: ReadinessResult;
  /** 3-staps machtigingstatus; afgeleide boolean zit in readiness.preconditions. */
  machtigingStatus: MachtigingStatus;
}) {
  const [pre, setPre] = useState<Preconditions>({
    theorieBehaald: readiness.preconditions.theorieBehaald,
    machtigingStatus,
    gezondheidsverklaringVereist:
      readiness.preconditions.gezondheidsverklaringVereist,
    gezondheidsverklaringGeregeld:
      readiness.preconditions.gezondheidsverklaringGeregeld,
  });
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function update<K extends keyof Preconditions>(
    key: K,
    value: Preconditions[K],
  ) {
    setError(null);
    const prev = pre[key];
    setPending((p) => ({ ...p, [key]: true }));
    const next: Preconditions = { ...pre, [key]: value };
    setPre(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("student_id", studentId);
      fd.set("theorie_behaald", next.theorieBehaald ? "1" : "0");
      fd.set("machtiging_status", next.machtigingStatus);
      fd.set(
        "gezondheidsverklaring_vereist",
        next.gezondheidsverklaringVereist ? "1" : "0",
      );
      fd.set(
        "gezondheidsverklaring_geregeld",
        next.gezondheidsverklaringGeregeld ? "1" : "0",
      );
      const res = await setStudentCbrStatusAction(fd);
      if (res?.error) {
        setError(res.error);
        // Revert only this field; preserve any concurrent edits to others.
        setPre((cur) => ({ ...cur, [key]: prev }));
      } else {
        // Re-run the server component so the readiness verdict recomputes.
        router.refresh();
      }
      setPending((p) => ({ ...p, [key]: false }));
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Examenrijpheid
          </div>
          <Badge variant={adviceVariant[readiness.advice]}>
            {ADVICE_LABELS[readiness.advice]}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {readiness.readinessPct}%
            </span>
            <span className="text-xs text-muted-foreground">
              {PHASE_LABELS[readiness.phase]} · ⌀ {readiness.averageScore.toFixed(1)}/8 ·{" "}
              {readiness.scoredLeaves}/{readiness.totalLeaves} beoordeeld
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={readiness.readinessPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${readiness.readinessPct}%` }}
            />
          </div>
        </div>

        {readiness.blockers.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Nog te doen
            </div>
            <ul className="space-y-1 text-sm text-foreground">
              {readiness.blockers.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Examenadvies — randvoorwaarden
          </div>
          <Toggle
            label="Theorie behaald"
            checked={pre.theorieBehaald}
            pending={Boolean(pending.theorieBehaald)}
            onChange={(v) => update("theorieBehaald", v)}
          />
          <Segmented
            label="Machtiging"
            value={pre.machtigingStatus}
            pending={Boolean(pending.machtigingStatus)}
            options={MACHTIGING_STATUSES.map((s) => ({
              value: s,
              label: MACHTIGING_STATUS_LABEL[s],
            }))}
            onChange={(v) => update("machtigingStatus", v as MachtigingStatus)}
          />
          <Toggle
            label="Gezondheidsverklaring vereist"
            checked={pre.gezondheidsverklaringVereist}
            pending={Boolean(pending.gezondheidsverklaringVereist)}
            onChange={(v) => update("gezondheidsverklaringVereist", v)}
          />
          {pre.gezondheidsverklaringVereist ? (
            <Toggle
              label="Gezondheidsverklaring geregeld"
              checked={pre.gezondheidsverklaringGeregeld}
              pending={Boolean(pending.gezondheidsverklaringGeregeld)}
              onChange={(v) => update("gezondheidsverklaringGeregeld", v)}
            />
          ) : null}
        </div>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {readiness.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  pending,
  onChange,
}: {
  label: string;
  checked: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={pending}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
        checked
          ? "border-primary/40 bg-primary-soft/40 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      <span className={cn(checked && "font-medium text-foreground")}>{label}</span>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Segmented({
  label,
  value,
  options,
  pending,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  pending: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="mb-1.5 text-sm text-muted-foreground">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-3 gap-1"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
