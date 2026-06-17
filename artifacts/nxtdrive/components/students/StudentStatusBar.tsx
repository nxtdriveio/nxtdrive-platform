import Link from "next/link";
import {
  CalendarClock,
  Wallet,
  Receipt,
  GraduationCap,
  ShieldCheck,
  HeartPulse,
  Gauge,
  ListTodo,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatTegoed } from "@/lib/students/types";
import { formatEuros } from "@/lib/invoices/types";
import type { ReadinessResult } from "@workspace/leskaart";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const READINESS_ADVICE_LABEL: Record<ReadinessResult["advice"], string> = {
  niet_examenrijp: "Nog niet examenrijp",
  bijna_examenrijp: "Bijna examenrijp",
  examenwaardig: "Examenwaardig",
};

const READINESS_ADVICE_VARIANT: Record<
  ReadinessResult["advice"],
  "success" | "warning" | "danger"
> = {
  niet_examenrijp: "danger",
  bijna_examenrijp: "warning",
  examenwaardig: "success",
};

type Tone = "success" | "warning" | "danger" | "info" | "muted";

function toneClasses(tone: Tone): string {
  switch (tone) {
    case "success":
      return "border-success/30 bg-success/5";
    case "warning":
      return "border-warning/30 bg-warning/5";
    case "danger":
      return "border-danger/30 bg-danger/5";
    case "info":
      return "border-info/30 bg-info/5";
    default:
      return "border-border bg-card";
  }
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "muted",
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  href?: string;
}) {
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col gap-1 rounded-lg border p-3 transition-colors",
        toneClasses(tone),
        href && "hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span aria-hidden>{icon}</span>
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
      {hint ? (
        <div className="text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/**
 * "In één oogopslag" — a compact status bar summarising the whole dossier:
 * next lesson, tegoed, open invoices, theory, CBR preconditions, exam-readiness
 * and open attention points. All values are derived from already-loaded,
 * tenant-scoped data; nothing is fabricated.
 */
export function StudentStatusBar({
  studentId,
  scope = "backoffice",
  nextLessonAt,
  balanceMinutes,
  openInvoiceCount,
  outstandingCents,
  theoriePassed,
  machtigingArranged,
  healthRequired,
  healthArranged,
  readiness,
  openTaskCount,
}: {
  studentId: string;
  scope?: "backoffice" | "instructor";
  nextLessonAt: string | null;
  balanceMinutes: number;
  openInvoiceCount: number;
  outstandingCents: number;
  theoriePassed: boolean | null;
  machtigingArranged: boolean | null;
  healthRequired: boolean;
  healthArranged: boolean | null;
  readiness: ReadinessResult;
  openTaskCount: number;
}) {
  const triState = (v: boolean | null): { label: string; tone: Tone } =>
    v === null
      ? { label: "Onbekend", tone: "muted" }
      : v
        ? { label: "Geregeld", tone: "success" }
        : { label: "Nog niet", tone: "warning" };

  const theorie =
    theoriePassed === null
      ? { label: "Onbekend", tone: "muted" as Tone }
      : theoriePassed
        ? { label: "Behaald", tone: "success" as Tone }
        : { label: "Nog niet", tone: "warning" as Tone };
  const machtiging = triState(machtigingArranged);
  const health = !healthRequired
    ? { label: "Niet nodig", tone: "muted" as Tone }
    : triState(healthArranged);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatTile
        icon={<CalendarClock className="h-3.5 w-3.5" />}
        label="Volgende les"
        value={nextLessonAt ? dtFmt.format(new Date(nextLessonAt)) : "Geen"}
        tone={nextLessonAt ? "info" : "muted"}
        href={
          scope === "instructor"
            ? `/instructor/les/nieuw?student_id=${studentId}`
            : `/backoffice/agenda/nieuw?student_id=${studentId}`
        }
      />
      <StatTile
        icon={<Wallet className="h-3.5 w-3.5" />}
        label="Tegoed"
        value={formatTegoed(balanceMinutes)}
        tone={
          balanceMinutes > 300
            ? "success"
            : balanceMinutes > 0
              ? "warning"
              : "danger"
        }
      />
      <StatTile
        icon={<Receipt className="h-3.5 w-3.5" />}
        label="Openstaand"
        value={
          openInvoiceCount === 0
            ? "Geen"
            : `${openInvoiceCount} · ${formatEuros(outstandingCents)}`
        }
        tone={openInvoiceCount > 0 ? "warning" : "success"}
      />
      <StatTile
        icon={<GraduationCap className="h-3.5 w-3.5" />}
        label="Theorie"
        value={theorie.label}
        tone={theorie.tone}
      />
      <StatTile
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
        label="Machtiging"
        value={machtiging.label}
        tone={machtiging.tone}
      />
      <StatTile
        icon={<HeartPulse className="h-3.5 w-3.5" />}
        label="Gezondheidsverkl."
        value={health.label}
        tone={health.tone}
      />
      <StatTile
        icon={<Gauge className="h-3.5 w-3.5" />}
        label="Examenrijpheid"
        value={
          <span className="flex items-center gap-2">
            {readiness.readinessPct}%
            <Badge variant={READINESS_ADVICE_VARIANT[readiness.advice]}>
              {READINESS_ADVICE_LABEL[readiness.advice]}
            </Badge>
          </span>
        }
        tone={
          readiness.advice === "examenwaardig"
            ? "success"
            : readiness.advice === "bijna_examenrijp"
              ? "warning"
              : "muted"
        }
      />
      <StatTile
        icon={<ListTodo className="h-3.5 w-3.5" />}
        label="Open taken"
        value={openTaskCount === 0 ? "Geen" : String(openTaskCount)}
        tone={openTaskCount > 0 ? "warning" : "success"}
      />
    </div>
  );
}
