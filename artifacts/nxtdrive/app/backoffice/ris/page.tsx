import type { ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  GraduationCap,
  ListChecks,
  UserRoundCheck,
} from "lucide-react";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";
import { loadBackofficeRisOverview } from "@/lib/ris/data";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoBubble } from "@/components/ui/info-bubble";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { upsertRisModuleTestFromFormAction } from "./actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const TEST_TYPE_LABEL: Record<string, string> = {
  instructor_test_1: "Toets 1",
  instructor_test_2: "Toets 2",
  ris_test_cbr: "RIS-toets CBR",
  ris_exam_cbr: "RIS-examen CBR",
};

const TEST_RESULT_LABEL: Record<string, string> = {
  planned: "Gepland",
  passed: "Behaald",
  failed: "Niet behaald",
  needs_repeat: "Herhalen",
  cancelled: "Geannuleerd",
};

const TEST_RESULT_VARIANT: Record<
  string,
  "default" | "info" | "warning" | "success" | "danger" | "outline"
> = {
  planned: "info",
  passed: "success",
  failed: "danger",
  needs_repeat: "warning",
  cancelled: "outline",
};

const TEST_TYPES = [
  "instructor_test_1",
  "instructor_test_2",
  "ris_test_cbr",
  "ris_exam_cbr",
] as const;

const TEST_RESULTS = [
  "planned",
  "passed",
  "failed",
  "needs_repeat",
  "cancelled",
] as const;

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card className="border-border/80 bg-card/70">
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function BackofficeRisPage({
  searchParams,
}: {
  searchParams?: Promise<{ ris_error?: string; ris_saved?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const context = await requireOrganizationPermission("student:read", {
    allowedRoles: [...STUDENT_BACKOFFICE_READ_ROLES],
  });
  const { organization: tenant } = context;
  const supabase = await createServerSupabaseClient();
  const branchScope = await loadOrganizationBranchScope(supabase, context);
  const service = createServiceRoleClient();
  const overview = await loadBackofficeRisOverview(service, tenant.id, {
    branchScope,
  });

  const moduleRows = [1, 2, 3, 4].map((moduleNumber) => {
    const students = overview.students.filter((student) =>
      student.moduleProgress.some(
        (module) =>
          module.moduleNumber === moduleNumber &&
          (module.attentionPoints > 0 || module.readyForModuleTest || module.assessedScripts > 0),
      ),
    );
    const ready = students.filter((student) =>
      student.moduleProgress.some(
        (module) => module.moduleNumber === moduleNumber && module.readyForModuleTest,
      ),
    ).length;
    const attention = students.reduce((sum, student) => {
      const module = student.moduleProgress.find((item) => item.moduleNumber === moduleNumber);
      return sum + (module?.attentionPoints ?? 0);
    }, 0);
    const averageProgress =
      students.length === 0
        ? 0
        : Math.round(
            students.reduce((sum, student) => {
              const module = student.moduleProgress.find(
                (item) => item.moduleNumber === moduleNumber,
              );
              return sum + (module?.progressPct ?? 0);
            }, 0) / students.length,
          );

    return { moduleNumber, students: students.length, ready, attention, averageProgress };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">
            <BookOpenCheck className="h-3.5 w-3.5" aria-hidden />
            RIS-leskaart
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              RIS-overzicht
            </h1>
            <p className="text-sm text-muted-foreground">
              Volg moduleprogressie, aandachtspunten, toetsklaar-status en
              ongepubliceerde leskaarten voor {tenant.name}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={overview.settings.lessonCardMode === "ris" ? "success" : "warning"}>
            Modus: {overview.settings.lessonCardMode === "ris" ? "RIS actief" : "Legacy"}
          </Badge>
          <Link
            href="/backoffice/theorie"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Theorie openen
          </Link>
          <Link
            href="/backoffice/leerlingen"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Leerlingen
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      {sp.ris_saved === "module-test" ? (
        <Card className="border-success/40 bg-success/5 p-4 text-sm text-success">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            RIS-moduletoets opgeslagen.
          </div>
        </Card>
      ) : null}

      {sp.ris_error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          RIS-moduletoets opslaan mislukt: {decodeURIComponent(sp.ris_error)}
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Leerlingen"
          value={String(overview.students.length)}
          hint="Actieve leerlingen binnen je scope."
          icon={GraduationCap}
        />
        <SummaryCard
          label="Aandacht"
          value={String(overview.attentionPoints)}
          hint="RIS-scripts met opvolging nodig."
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Toetsklaar"
          value={String(overview.readyForModuleTest)}
          hint="Scripts gemarkeerd als moduletoetsklaar."
          icon={ClipboardCheck}
        />
        <SummaryCard
          label="Niet gepubliceerd"
          value={String(overview.draftLessonCards)}
          hint="Draft leskaarten die nog gedeeld moeten worden."
          icon={FileWarning}
        />
        <SummaryCard
          label="Moduletoetsen"
          value={String(overview.moduleTestsPlanned)}
          hint="Geplande RIS-toetsmomenten."
          icon={ListChecks}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-foreground">
                Moduletoets of CBR-moment registreren
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Leg Toets 1, Toets 2, RIS-toets CBR of RIS-examen CBR vast.
                CBR-momenten kun je daarna direct als agenda-afspraak plannen.
              </p>
            </div>
            <InfoBubble className="mt-1 h-4 w-4 text-muted-foreground">
              Dit schrijft alleen RIS-toetsstatus. Het daadwerkelijke agenda-event
              maak je via de knop "Plan in agenda".
            </InfoBubble>
          </div>
        </CardHeader>
        <CardContent>
          {overview.students.length === 0 ? (
            <EmptyState message="Geen actieve leerlingen binnen je scope om een RIS-toets voor te registreren." />
          ) : (
            <form
              action={upsertRisModuleTestFromFormAction}
              className="grid gap-4 lg:grid-cols-4"
            >
              <input type="hidden" name="redirect_to" value="/backoffice/ris" />

              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="student_id">Leerling</Label>
                <Select id="student_id" name="student_id" required>
                  {overview.students.map((student) => (
                    <option key={student.studentId} value={student.studentId}>
                      {student.fullName}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="module_number">Module</Label>
                <Select id="module_number" name="module_number" defaultValue="1" required>
                  <option value="1">Module 1</option>
                  <option value="2">Module 2</option>
                  <option value="3">Module 3</option>
                  <option value="4">Module 4</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="test_type">Toetsmoment</Label>
                <Select id="test_type" name="test_type" defaultValue="instructor_test_1" required>
                  {TEST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TEST_TYPE_LABEL[type]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="result">Status/resultaat</Label>
                <Select id="result" name="result" defaultValue="planned">
                  {TEST_RESULTS.map((result) => (
                    <option key={result} value={result}>
                      {TEST_RESULT_LABEL[result]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="planned_at">Gepland op</Label>
                <Input id="planned_at" name="planned_at" type="datetime-local" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="completed_at">Afgerond op</Label>
                <Input id="completed_at" name="completed_at" type="datetime-local" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cbr_reference">CBR-referentie</Label>
                <Input
                  id="cbr_reference"
                  name="cbr_reference"
                  maxLength={120}
                  placeholder="Optioneel"
                />
              </div>

              <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground lg:col-span-2">
                <input
                  name="exemption_special_manoeuvres"
                  type="checkbox"
                  className="h-4 w-4 rounded border-border bg-background"
                />
                Vrijstelling bijzondere verrichtingen vastleggen
              </label>

              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="notes">Notities</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  maxLength={1500}
                  placeholder="Bijv. vervolgadvies of CBR-afspraakcontext"
                />
              </div>

              <div className="flex items-end justify-end lg:col-span-4">
                <Button type="submit">Moduletoets opslaan</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-foreground">Leerlingen per module</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Waar staat de groep binnen de vier RIS-modules?
                </p>
              </div>
              <InfoBubble className="mt-1 h-4 w-4 text-muted-foreground">
                Gemiddelde modulevoortgang gebruikt alleen gepubliceerde RIS-scores.
              </InfoBubble>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {moduleRows.map((row) => (
              <div
                key={row.moduleNumber}
                className="rounded-xl border border-border bg-muted/20 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">Module {row.moduleNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.students} leerlingen · {row.ready} toetsklaar · {row.attention} aandachtspunten
                    </p>
                  </div>
                  <Badge variant={row.ready > 0 ? "success" : "outline"}>
                    {row.averageProgress}% gemiddeld
                  </Badge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, row.averageProgress))}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Instructeur-opvolging</CardTitle>
            <p className="text-sm text-muted-foreground">
              Wie heeft nog drafts, aandachtspunten of toetsklare scripts open?
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.instructorFollowups.length === 0 ? (
              <EmptyState message="Geen open RIS-opvolging per instructeur." />
            ) : (
              overview.instructorFollowups.map((row) => (
                <div
                  key={row.instructorId}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{row.instructorName}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.draftLessonCards} drafts · {row.attentionPoints} aandacht ·{" "}
                        {row.readyForModuleTest} toetsklaar
                      </p>
                    </div>
                    <UserRoundCheck className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Aandachtspunten</CardTitle>
            <p className="text-sm text-muted-foreground">
              Gepubliceerde RIS-voortgang die extra begeleiding vraagt.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.attentionRows.length === 0 ? (
              <EmptyState message="Geen RIS-aandachtspunten binnen je scope." />
            ) : (
              overview.attentionRows.map((row) => (
                <div
                  key={`${row.studentId}:${row.scriptId}`}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/backoffice/leerlingen/${row.studentId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {row.fullName}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {row.scriptTitle}
                      </p>
                      {/*
                      <p className="mt-1 text-sm text-muted-foreground">
                        Module {test.moduleNumber} · {TEST_TYPE_LABEL[test.testType] ?? test.testType}
                      </p>
                      */}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.instructorName}
                        {row.lastAssessedAt ? ` · ${dateTimeFmt.format(new Date(row.lastAssessedAt))}` : ""}
                      </p>
                    </div>
                    <Badge variant="warning">
                      {row.currentFinalStep ? `Stap ${row.currentFinalStep}` : "N"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Niet-gepubliceerde leskaarten</CardTitle>
            <p className="text-sm text-muted-foreground">
              Concepten die nog niet zichtbaar zijn voor leerlingen.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.draftCards.length === 0 ? (
              <EmptyState message="Alle RIS-leskaarten zijn gepubliceerd of er zijn nog geen drafts." />
            ) : (
              overview.draftCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/instructor/${card.lessonId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {card.studentName}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {card.instructorName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Laatst bijgewerkt: {dateTimeFmt.format(new Date(card.updatedAt))}
                      </p>
                    </div>
                    <Badge variant="warning">Draft</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Moduletoetsen</CardTitle>
            <p className="text-sm text-muted-foreground">
              Toets 1, Toets 2 en RIS/CBR-momenten in opvolging.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.moduleTests.length === 0 ? (
              <EmptyState message="Nog geen RIS-moduletoetsen geregistreerd." />
            ) : (
              overview.moduleTests.map((test) => (
                <div
                  key={test.id}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/backoffice/leerlingen/${test.studentId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {test.studentName}
                      </Link>
                      <p className="hidden">
                        Module {test.moduleNumber} · {TEST_TYPE_LABEL[test.testType] ?? test.testType}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Module {test.moduleNumber} · {TEST_TYPE_LABEL[test.testType] ?? test.testType}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {test.plannedAt ? dateFmt.format(new Date(test.plannedAt)) : "Nog niet gepland"}
                        {test.instructorName ? ` · ${test.instructorName}` : ""}
                      </p>
                      {test.cbrReference ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          CBR-ref: {test.cbrReference}
                        </p>
                      ) : null}
                      {test.exemptionSpecialManoeuvres ? (
                        <Badge variant="success" className="mt-2">
                          Vrijstelling bijzondere verrichtingen
                        </Badge>
                      ) : null}
                      {test.notes ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {test.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant={TEST_RESULT_VARIANT[test.result] ?? "outline"}>
                        {TEST_RESULT_LABEL[test.result] ?? test.result}
                      </Badge>
                      <Link
                        href={agendaHrefForModuleTest(test)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                        Plan in agenda
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function agendaHrefForModuleTest(test: {
  studentId: string;
  studentName: string;
  moduleNumber: number;
  testType: string;
  plannedAt: string | null;
  cbrReference: string | null;
  notes: string | null;
}) {
  const type = test.testType === "ris_exam_cbr" ? "exam" : "interim_test";
  const params = new URLSearchParams({
    type,
    student_id: test.studentId,
    duration_min: type === "exam" ? "120" : "90",
    title: `${TEST_TYPE_LABEL[test.testType] ?? "RIS-toets"} module ${test.moduleNumber}`,
    notes: [
      `RIS-context: ${TEST_TYPE_LABEL[test.testType] ?? test.testType} voor ${test.studentName}.`,
      test.cbrReference ? `CBR-referentie: ${test.cbrReference}.` : null,
      test.notes,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (test.plannedAt) {
    const date = new Date(test.plannedAt);
    if (!Number.isNaN(date.getTime())) {
      params.set("date", date.toISOString().slice(0, 10));
      params.set("time", date.toISOString().slice(11, 16));
    }
  }
  return `/backoffice/agenda/afspraak/nieuw?${params.toString()}`;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
