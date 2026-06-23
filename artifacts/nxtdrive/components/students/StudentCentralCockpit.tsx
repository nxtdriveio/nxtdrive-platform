import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileText,
  GraduationCap,
  IdCard,
  ListTodo,
  MapPin,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEuros, type Invoice } from "@/lib/invoices/types";
import type { Lesson } from "@/lib/lessons/types";
import type { LeadIntakeDetail } from "@/lib/leads/types";
import type { StudentCbrStatus } from "@/lib/cbr/types";
import type { StudentDocument } from "@/lib/students/document-types";
import type { StudentLinkedTask } from "@/lib/students/dossier";
import { formatTegoed, type Student } from "@/lib/students/types";
import type { TheoryHomeworkWithModule } from "@/lib/theory/types";
import type { StudentRisProgress } from "@/lib/ris/data";
import type { ReadinessResult } from "@workspace/leskaart";
import {
  buildStudentDossierQualitySummary,
  nextBestActionFromSignals,
  type DossierQualityTone,
  type StudentDossierQualitySignal,
} from "@/lib/students/dossier-quality";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type NextBestAction = {
  title: string;
  description: string;
  href?: string;
  cta?: string;
  tone: "primary" | "warning" | "danger" | "success";
};

type Props = {
  student: Student;
  intake: LeadIntakeDetail | null;
  nextLesson: Lesson | null;
  balanceMinutes: number;
  invoices: Invoice[];
  outstandingCents: number;
  cbrStatus: StudentCbrStatus | null;
  theory: TheoryHomeworkWithModule[];
  readiness: ReadinessResult;
  risProgress: StudentRisProgress;
  tasks: StudentLinkedTask[];
  documents: StudentDocument[];
};

export function StudentCentralCockpit({
  student,
  intake,
  nextLesson,
  balanceMinutes,
  invoices,
  outstandingCents,
  cbrStatus,
  theory,
  readiness,
  risProgress,
  tasks,
  documents,
}: Props) {
  const naw = buildNaw(student, intake);
  const openInvoices = invoices.filter((invoice) => invoice.status === "open");
  const openTheory = theory.filter((item) => item.status === "open");
  const latestDocument = documents[0] ?? null;
  const latestRisCard = risProgress.publishedCards[0] ?? null;
  const completedRisModules = risProgress.moduleProgress.filter(
    (module) => module.progressPct >= 100,
  ).length;
  const quality = buildStudentDossierQualitySummary({
    student,
    naw,
    nextLesson,
    balanceMinutes,
    invoices,
    cbrStatus,
    theory,
    readiness,
    tasks,
    documents,
  });
  const nextAction = getNextBestAction({
    student,
    naw,
    nextLesson,
    balanceMinutes,
    openInvoiceCount: openInvoices.length,
    outstandingCents,
    cbrStatus,
    openTheoryCount: openTheory.length,
    readiness,
    risProgress,
    tasks,
    signals: quality.signals,
  });

  return (
    <Card className="overflow-hidden border-brand-border bg-[var(--surface-1)] shadow-[var(--admin-card-shadow)]">
      <CardHeader className="border-b border-brand-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Centrale cockpit
            </p>
            <CardTitle className="mt-1 text-xl font-black tracking-tight">
              {student.full_name}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Een volledig leerlingbeeld voor planning, voortgang, administratie
              en opvolging.
            </p>
          </div>
          <NextBestActionPanel action={nextAction} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <DossierQualityStrip quality={quality} />

        <div className="grid gap-3 xl:grid-cols-4">
          <CockpitTile
            title="NAW gegevens"
            icon={<IdCard className="h-4 w-4" aria-hidden />}
            className="xl:col-span-2"
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Naam" value={student.full_name} />
              <Field label="E-mail" value={student.email} />
              <Field label="Telefoon" value={student.phone} />
              <Field label="Geboortedatum" value={formatDate(naw.dateOfBirth)} />
              <Field label="Adres" value={naw.address} />
              <Field label="Postcode" value={student.postcode} />
              <Field label="Woonplaats" value={naw.city} />
              <Field label="Ophaaladres" value={naw.pickupLocation} />
            </dl>
          </CockpitTile>

          <CockpitTile
            title="Status"
            icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
          >
            <Metric
              label="Dossier"
              value={student.active ? "Actief" : "Inactief"}
              badgeVariant={student.active ? "success" : "default"}
            />
            <Metric
              label="Login"
              value={student.user_id ? "Gekoppeld" : "Niet gekoppeld"}
              badgeVariant={student.user_id ? "success" : "warning"}
            />
            <Metric
              label="Leerling sinds"
              value={dateFmt.format(new Date(student.created_at))}
            />
          </CockpitTile>

          <CockpitTile
            title="Volgende les"
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          >
            {nextLesson ? (
              <div className="space-y-2">
                <p className="text-lg font-black text-foreground">
                  {dateTimeFmt.format(new Date(nextLesson.starts_at))}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {nextLesson.location ?? "Locatie nog niet ingevuld"}
                </p>
                <Badge variant="info">{nextLesson.duration_min} minuten</Badge>
              </div>
            ) : (
              <EmptyText>Geen geplande les.</EmptyText>
            )}
          </CockpitTile>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CockpitTile
            title="Tegoed"
            icon={<Wallet className="h-4 w-4" aria-hidden />}
          >
            <p className="text-2xl font-black text-foreground">
              {formatTegoed(balanceMinutes)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Beschikbaar voor lessen en afspraken.
            </p>
          </CockpitTile>

          <CockpitTile
            title="Open facturen"
            icon={<Receipt className="h-4 w-4" aria-hidden />}
          >
            <p className="text-2xl font-black text-foreground">
              {openInvoices.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {openInvoices.length > 0
                ? `${formatEuros(outstandingCents)} openstaand`
                : "Geen openstaande facturen."}
            </p>
          </CockpitTile>

          <CockpitTile
            title="CBR"
            icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          >
            <div className="space-y-2">
              <Metric
                label="Theorie"
                value={cbrStatus?.theorie_behaald ? "Behaald" : "Nog niet"}
                badgeVariant={cbrStatus?.theorie_behaald ? "success" : "warning"}
              />
              <Metric
                label="Machtiging"
                value={cbrStatus?.machtiging_geregeld ? "Geregeld" : "Nog nodig"}
                badgeVariant={cbrStatus?.machtiging_geregeld ? "success" : "warning"}
              />
              <Metric
                label="Gezondheidsverklaring"
                value={
                  cbrStatus?.gezondheidsverklaring_vereist === false
                    ? "Niet nodig"
                    : cbrStatus?.gezondheidsverklaring_geregeld
                      ? "Geregeld"
                      : "Nog nodig"
                }
                badgeVariant={
                  cbrStatus?.gezondheidsverklaring_vereist === false ||
                  cbrStatus?.gezondheidsverklaring_geregeld
                    ? "success"
                    : "warning"
                }
              />
            </div>
          </CockpitTile>

          <CockpitTile
            title="Theorie"
            icon={<GraduationCap className="h-4 w-4" aria-hidden />}
          >
            <p className="text-2xl font-black text-foreground">
              {openTheory.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {openTheory.length === 1
                ? "open opdracht"
                : "open opdrachten"}
            </p>
          </CockpitTile>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CockpitTile title="RIS" icon={<MapPin className="h-4 w-4" aria-hidden />}>
            <p className="text-2xl font-black text-foreground">
              {risProgress.progressPct}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {completedRisModules} van {risProgress.moduleProgress.length} modules
              volledig.
            </p>
            {latestRisCard?.homeworkOrNextFocus ? (
              <p className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-xs font-semibold text-primary">
                {latestRisCard.homeworkOrNextFocus}
              </p>
            ) : null}
          </CockpitTile>

          <CockpitTile
            title="Open taken"
            icon={<ListTodo className="h-4 w-4" aria-hidden />}
          >
            <p className="text-2xl font-black text-foreground">{tasks.length}</p>
            {tasks[0] ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Eerstvolgend: {tasks[0].title}
              </p>
            ) : (
              <EmptyText>Geen open taken.</EmptyText>
            )}
          </CockpitTile>

          <CockpitTile
            title="Documenten"
            icon={<FileText className="h-4 w-4" aria-hidden />}
          >
            <p className="text-2xl font-black text-foreground">
              {documents.length}
            </p>
            {latestDocument ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Laatste: {latestDocument.file_name}
              </p>
            ) : (
              <EmptyText>Geen documenten geupload.</EmptyText>
            )}
          </CockpitTile>

          <CockpitTile
            title="Examenrijpheid"
            icon={<Sparkles className="h-4 w-4" aria-hidden />}
          >
            <p className="text-2xl font-black text-foreground">
              {readiness.readinessPct}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {readiness.blockers.length > 0
                ? `${readiness.blockers.length} aandachtspunt(en)`
                : "Geen blokkades geregistreerd."}
            </p>
          </CockpitTile>
        </div>
      </CardContent>
    </Card>
  );
}

function DossierQualityStrip({
  quality,
}: {
  quality: ReturnType<typeof buildStudentDossierQualitySummary>;
}) {
  const visibleSignals = quality.signals.slice(0, 5);
  const hiddenCount = Math.max(0, quality.signals.length - visibleSignals.length);
  return (
    <section className="rounded-2xl border border-brand-border bg-[var(--surface-2)] p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={qualityIconClass(quality.tone)}>
              {quality.tone === "success" ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4" aria-hidden />
              )}
            </span>
            <p className="text-sm font-black text-foreground">Leerling 360</p>
            <Badge variant={qualityBadgeVariant(quality.tone)}>
              {quality.label} · {quality.score}%
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Compacte samenvatting van dossierkwaliteit, planning,
            administratie, CBR en voortgang.
          </p>
        </div>

        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:max-w-4xl">
          {visibleSignals.length > 0 ? (
            visibleSignals.map((signal) => (
              <DossierSignalPill key={signal.id} signal={signal} />
            ))
          ) : (
            <div className="rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-sm font-semibold text-foreground">
              Geen directe waarschuwingen. Dossier, planning en voortgang zijn
              op orde.
            </div>
          )}
          {hiddenCount > 0 ? (
            <div className="rounded-xl border border-brand-border bg-background/70 px-3 py-2 text-sm font-semibold text-muted-foreground">
              +{hiddenCount} extra aandachtspunt(en) lager in het dossier.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DossierSignalPill({ signal }: { signal: StudentDossierQualitySignal }) {
  const content = (
    <div className={signalPillClass(signal.tone)}>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-foreground">
          {signal.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {signal.description}
        </p>
      </div>
      {signal.cta ? (
        <span className="shrink-0 text-xs font-black text-primary">
          {signal.cta}
        </span>
      ) : null}
    </div>
  );
  return signal.href ? (
    <Link href={signal.href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

function qualityIconClass(tone: DossierQualityTone): string {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border";
  if (tone === "success") return `${base} border-success/25 bg-success/10 text-success`;
  if (tone === "danger") return `${base} border-danger/25 bg-danger/10 text-danger`;
  if (tone === "warning") return `${base} border-warning/25 bg-warning/10 text-warning`;
  return `${base} border-primary/20 bg-primary-soft text-primary`;
}

function signalPillClass(tone: DossierQualityTone): string {
  const base =
    "flex min-w-0 items-start justify-between gap-3 rounded-xl border px-3 py-2";
  if (tone === "danger") return `${base} border-danger/25 bg-danger/10`;
  if (tone === "warning") return `${base} border-warning/25 bg-warning/10`;
  if (tone === "success") return `${base} border-success/25 bg-success/10`;
  return `${base} border-primary/20 bg-primary-soft/70`;
}

function qualityBadgeVariant(
  tone: DossierQualityTone,
): "success" | "warning" | "danger" | "info" | "default" {
  if (tone === "success") return "success";
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warning";
  return "info";
}

function CockpitTile({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-brand-border bg-[var(--surface-2)] p-4 ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-black text-foreground">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
          {icon}
        </span>
        {title}
      </div>
      {children}
    </section>
  );
}

function NextBestActionPanel({ action }: { action: NextBestAction }) {
  const toneClass =
    action.tone === "success"
      ? "border-success/25 bg-success/10"
      : action.tone === "danger"
        ? "border-danger/25 bg-danger/10"
        : action.tone === "warning"
          ? "border-warning/25 bg-warning/10"
          : "border-primary/20 bg-primary-soft";
  const content = (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      <div className="flex items-center gap-2 font-black text-foreground">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        Next best action
      </div>
      <p className="mt-1 font-semibold text-foreground">{action.title}</p>
      <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
        {action.description}
      </p>
      {action.cta ? (
        <span className="mt-2 inline-flex text-xs font-black text-primary">
          {action.cta}
        </span>
      ) : null}
    </div>
  );

  return action.href ? (
    <Link href={action.href} className="block lg:max-w-xl">
      {content}
    </Link>
  ) : (
    <div className="lg:max-w-xl">{content}</div>
  );
}

function Metric({
  label,
  value,
  badgeVariant,
}: {
  label: string;
  value: string;
  badgeVariant?: "success" | "warning" | "danger" | "info" | "default";
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {badgeVariant ? (
        <Badge variant={badgeVariant}>{value}</Badge>
      ) : (
        <span className="text-sm font-semibold text-foreground">{value}</span>
      )}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 min-h-5 break-words text-sm font-semibold text-foreground">
        {value && value.trim() ? value : "-"}
      </dd>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-muted-foreground">{children}</p>;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFmt.format(date);
}

function buildNaw(student: Student, intake: LeadIntakeDetail | null) {
  const notes = student.notes ?? "";
  return {
    dateOfBirth: intake?.date_of_birth ?? readNawNote(notes, "Geboortedatum"),
    city: intake?.city ?? readNawNote(notes, "Woonplaats"),
    address: readNawNote(notes, "Adres"),
    pickupLocation:
      intake?.pickup_location ??
      readNawNote(notes, "Ophaaladres") ??
      readNawNote(notes, "Adres"),
  };
}

function readNawNote(notes: string, label: string): string | null {
  const prefix = `${label.toLowerCase()}:`;
  const line = notes
    .split(/\r?\n/)
    .find((item) => item.trim().toLowerCase().startsWith(prefix));
  if (!line) return null;
  const value = line.slice(line.indexOf(":") + 1).trim();
  return value || null;
}

function getNextBestAction(input: {
  student: Student;
  naw: ReturnType<typeof buildNaw>;
  nextLesson: Lesson | null;
  balanceMinutes: number;
  openInvoiceCount: number;
  outstandingCents: number;
  cbrStatus: StudentCbrStatus | null;
  openTheoryCount: number;
  readiness: ReadinessResult;
  risProgress: StudentRisProgress;
  tasks: StudentLinkedTask[];
  signals: StudentDossierQualitySignal[];
}): NextBestAction {
  const signal = nextBestActionFromSignals(input.signals);
  if (signal) {
    return {
      title: signal.title,
      description: signal.description,
      href: signal.href,
      cta: signal.cta,
      tone:
        signal.tone === "danger"
          ? "danger"
          : signal.tone === "warning"
            ? "warning"
            : "primary",
    };
  }

  const missingNaw = [
    !input.student.email ? "e-mailadres" : null,
    !input.student.phone ? "telefoon" : null,
    !input.student.postcode ? "postcode" : null,
    !input.naw.city ? "woonplaats" : null,
    !input.naw.dateOfBirth ? "geboortedatum" : null,
    !input.naw.pickupLocation ? "ophaaladres" : null,
  ].filter((item): item is string => Boolean(item));

  if (missingNaw.length > 0) {
    return {
      title: "Vul het leerlingprofiel aan",
      description: `Ontbreekt: ${missingNaw.join(", ")}. Dit maakt planning, CBR-opvolging en communicatie betrouwbaarder.`,
      tone: "warning",
    };
  }

  if (!input.nextLesson) {
    return {
      title: "Plan de volgende les",
      description:
        "Er staat nog geen volgende les klaar. Plan een moment voordat de voortgang stilvalt.",
      href: `/backoffice/agenda/nieuw?student_id=${input.student.id}`,
      cta: "Les plannen",
      tone: "primary",
    };
  }

  if (input.balanceMinutes <= 0) {
    return {
      title: "Tegoed aanvullen",
      description:
        "Deze leerling heeft geen lestegoed meer. Maak een factuur of ken een pakket toe.",
      tone: "danger",
    };
  }

  if (input.openInvoiceCount > 0) {
    return {
      title: "Volg open facturen op",
      description: `${input.openInvoiceCount} factuur/facturen staan open voor ${formatEuros(input.outstandingCents)}.`,
      tone: "warning",
    };
  }

  if (
    !input.cbrStatus?.theorie_behaald ||
    !input.cbrStatus?.machtiging_geregeld ||
    (input.cbrStatus?.gezondheidsverklaring_vereist !== false &&
      !input.cbrStatus?.gezondheidsverklaring_geregeld)
  ) {
    return {
      title: "Werk CBR-status bij",
      description:
        "Theorie, machtiging of gezondheidsverklaring is nog niet volledig geregeld.",
      tone: "warning",
    };
  }

  if (input.openTheoryCount > 0) {
    return {
      title: "Theorie-opdrachten opvolgen",
      description: `${input.openTheoryCount} theorie-opdracht(en) staan nog open.`,
      tone: "warning",
    };
  }

  if (input.tasks.length > 0) {
    return {
      title: input.tasks[0]!.title,
      description: "Er staat nog een open taak gekoppeld aan deze leerling.",
      tone: "warning",
    };
  }

  if (input.readiness.blockers.length > 0 || input.risProgress.progressPct < 100) {
    return {
      title: "Richt de volgende les op voortgang",
      description:
        "Gebruik RIS en de examenrijpheid om de eerstvolgende focus te bepalen.",
      tone: "primary",
    };
  }

  return {
    title: "Alles staat klaar",
    description:
      "Profiel, planning, administratie en voortgang hebben geen directe blokkade.",
    tone: "success",
  };
}
