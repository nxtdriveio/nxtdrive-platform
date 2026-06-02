import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import {
  APPOINTMENT_TYPE_LABEL,
  type AgendaAppointment,
} from "@/lib/agenda/types";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  displayStatus,
  formatEuros,
  type Invoice,
} from "@/lib/invoices/types";
import {
  THEORY_HOMEWORK_STATUS_LABEL,
  THEORY_HOMEWORK_STATUS_VARIANT,
  type TheoryHomeworkWithModule,
} from "@/lib/theory/types";
import {
  INTAKE_LICENSE_GOAL_LABEL,
  INTAKE_TRANSMISSION_LABEL,
  INTAKE_PACE_LABEL,
  INTAKE_STATUS_LABEL,
  type LeadIntakeDetail,
} from "@/lib/leads/types";
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_VARIANT } from "@/lib/tasks/types";
import { formatTegoed } from "@/lib/students/types";
import type { CbrChecklistItem, StudentCbrStatus } from "@/lib/cbr/types";
import { readinessPct } from "@/lib/cbr/types";
import type { ReadinessResult } from "@workspace/leskaart";
import type {
  StudentAppointment,
  StudentCommunication,
  StudentGuardianView,
  StudentLinkedTask,
} from "@/lib/students/dossier";
import { cn } from "@/lib/utils";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function fmtDate(value: string | null | undefined): string {
  return value ? dateFmt.format(new Date(value)) : "—";
}

function YesNo({ value }: { value: boolean | null | undefined }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">Onbekend</span>;
  return <span>{value ? "Ja" : "Nee"}</span>;
}

// --- Guardians --------------------------------------------------------------

export function GuardiansCard({
  guardians,
}: {
  guardians: StudentGuardianView[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ouders / verzorgers</CardTitle>
      </CardHeader>
      <CardContent>
        {guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen ouders of verzorgers gekoppeld.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {guardians.map((g) => (
              <li key={g.id} className="flex flex-col gap-0.5 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  {g.full_name ?? "Onbekende naam"}
                  {g.relation ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {g.relation}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.email ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Intake -----------------------------------------------------------------

export function IntakeCard({ intake }: { intake: LeadIntakeDetail | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Intake</CardTitle>
      </CardHeader>
      <CardContent>
        {!intake ? (
          <p className="text-sm text-muted-foreground">
            Geen intakegegevens beschikbaar voor deze leerling.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Field
              label="Rijbewijs"
              value={
                intake.license_goal
                  ? INTAKE_LICENSE_GOAL_LABEL[intake.license_goal]
                  : null
              }
            />
            <Field
              label="Schakeling"
              value={
                intake.transmission
                  ? INTAKE_TRANSMISSION_LABEL[intake.transmission]
                  : null
              }
            />
            <Field
              label="Tempo"
              value={intake.pace ? INTAKE_PACE_LABEL[intake.pace] : null}
            />
            <Field label="Stad" value={intake.city} />
            <Field label="Ophaallocatie" value={intake.pickup_location} />
            <Field
              label="Gewenste startdatum"
              value={fmtDate(intake.desired_start_date)}
            />
            <FieldNode label="Rijervaring">
              <YesNo value={intake.has_driving_experience} />
            </FieldNode>
            <FieldNode label="Eerder lessen gehad">
              <YesNo value={intake.had_lessons_before} />
            </FieldNode>
            <FieldNode label="Eerder examen gedaan">
              <YesNo value={intake.has_done_exam} />
            </FieldNode>
            <FieldNode label="Examenangst">
              <YesNo value={intake.has_anxiety} />
            </FieldNode>
            <Field
              label="Theorie (intake)"
              value={INTAKE_STATUS_LABEL[intake.theory_status]}
            />
            <Field
              label="Gezondheidsverkl. (intake)"
              value={INTAKE_STATUS_LABEL[intake.health_declaration_status]}
            />
            {intake.remarks ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Opmerkingen
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-foreground">
                  {intake.remarks}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

// --- Readiness (Leskaart L1) ------------------------------------------------

export function ReadinessCard({ readiness }: { readiness: ReadinessResult }) {
  const pct = readiness.readinessPct;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Examenrijpheid &amp; voortgang</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {pct}%
            </span>
            <span className="text-xs text-muted-foreground">
              {readiness.scoredLeaves} / {readiness.totalLeaves} onderdelen
              beoordeeld · gem. {readiness.averageScore.toFixed(1)}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {readiness.blockers.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Wat staat een examen nog in de weg
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-foreground">
              {readiness.blockers.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-success">
            Geen blokkades — voldoet aan alle examenwaardigheidscriteria.
          </p>
        )}

        <p className="text-xs text-muted-foreground">{readiness.disclaimer}</p>
      </CardContent>
    </Card>
  );
}

// --- CBR status + checklist -------------------------------------------------

function StatusRow({
  label,
  ok,
  okText = "Geregeld",
  notText = "Nog niet",
  na,
}: {
  label: string;
  ok: boolean;
  okText?: string;
  notText?: string;
  na?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      {na ? (
        <Badge variant="default">Niet nodig</Badge>
      ) : (
        <Badge variant={ok ? "success" : "warning"}>
          {ok ? okText : notText}
        </Badge>
      )}
    </div>
  );
}

export function CbrStatusCard({
  status,
  checklist,
}: {
  status: StudentCbrStatus | null;
  checklist: CbrChecklistItem[];
}) {
  const theorie = status?.theorie_behaald ?? false;
  const machtiging = status?.machtiging_geregeld ?? false;
  const healthRequired = status?.gezondheidsverklaring_vereist ?? true;
  const healthArranged = status?.gezondheidsverklaring_geregeld ?? false;
  const pct = readinessPct(checklist);
  const done = checklist.filter((i) => i.achieved).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>CBR-status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border">
          <StatusRow label="Theorie behaald" ok={theorie} okText="Behaald" />
          <StatusRow label="Machtiging geregeld" ok={machtiging} />
          <StatusRow
            label="Gezondheidsverklaring"
            ok={healthArranged}
            na={!healthRequired}
          />
        </div>

        {checklist.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>Rijvaardigheden (CBR-checklist)</span>
              <span className="tabular-nums">
                {done} / {checklist.length} · {pct}%
              </span>
            </div>
            <ul className="space-y-1">
              {checklist.map((item) => (
                <li
                  key={item.competency.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-sm",
                    item.achieved
                      ? "border-primary/40 bg-primary-soft/40 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <span>{item.competency.label}</span>
                  {item.achieved && item.achieved_at ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {fmtDate(item.achieved_at)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status ? (
          <p className="text-xs text-muted-foreground">
            Laatst bijgewerkt {dtFmt.format(new Date(status.updated_at))}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nog niets geregistreerd.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --- Theory -----------------------------------------------------------------

export function TheoryCard({
  homework,
}: {
  homework: TheoryHomeworkWithModule[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Theorie</CardTitle>
      </CardHeader>
      <CardContent>
        {homework.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen theorie-huiswerk toegewezen.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {homework.map((hw) => (
              <li
                key={hw.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {hw.moduleTitle}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hw.deadline
                      ? `Deadline ${fmtDate(hw.deadline)}`
                      : "Geen deadline"}
                    {hw.note ? ` · ${hw.note}` : ""}
                  </div>
                </div>
                <Badge variant={THEORY_HOMEWORK_STATUS_VARIANT[hw.status]}>
                  {THEORY_HOMEWORK_STATUS_LABEL[hw.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Lesson history ---------------------------------------------------------

export function LessonHistoryCard({ lessons }: { lessons: Lesson[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lesgeschiedenis</CardTitle>
      </CardHeader>
      <CardContent>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen lessen geregistreerd.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {lessons.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={`/backoffice/agenda/${l.id}`}
                  className="flex-1 hover:underline"
                >
                  <div className="text-sm font-medium text-foreground">
                    {dtFmt.format(new Date(l.starts_at))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.location ?? "—"} · {formatTegoed(l.credits_cost)}
                    {l.progress_score != null
                      ? ` · score ${l.progress_score}`
                      : ""}
                  </div>
                </Link>
                <Badge variant={LESSON_STATUS_VARIANT[l.status]}>
                  {LESSON_STATUS_LABEL[l.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Planned lessons + exams ------------------------------------------------

export function PlannedCard({
  upcomingLessons,
  appointments,
  studentId,
}: {
  upcomingLessons: Lesson[];
  appointments: StudentAppointment[];
  studentId: string;
}) {
  const hasNothing = upcomingLessons.length === 0 && appointments.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Geplande lessen &amp; examens</CardTitle>
      </CardHeader>
      <CardContent>
        {hasNothing ? (
          <p className="text-sm text-muted-foreground">
            Geen geplande lessen of examens.{" "}
            <Link
              href={`/backoffice/agenda/nieuw?student_id=${studentId}`}
              className="text-primary hover:underline"
            >
              Plan er één →
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {appointments.map((a: AgendaAppointment) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {dtFmt.format(new Date(a.starts_at))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.title ?? a.location ?? "—"}
                  </div>
                </div>
                <Badge variant="danger">{APPOINTMENT_TYPE_LABEL[a.type]}</Badge>
              </li>
            ))}
            {upcomingLessons.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={`/backoffice/agenda/${l.id}`}
                  className="flex-1 hover:underline"
                >
                  <div className="text-sm font-medium text-foreground">
                    {dtFmt.format(new Date(l.starts_at))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.location ?? "—"} · {formatTegoed(l.credits_cost)}
                  </div>
                </Link>
                <Badge variant={LESSON_STATUS_VARIANT[l.status]}>
                  {LESSON_STATUS_LABEL[l.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Invoices ---------------------------------------------------------------

export function InvoicesCard({
  invoices,
  outstandingCents,
}: {
  invoices: Invoice[];
  outstandingCents: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturen</CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen facturen.</p>
        ) : (
          <>
            {outstandingCents > 0 ? (
              <p className="mb-3 text-sm text-warning">
                Openstaand: {formatEuros(outstandingCents)}
              </p>
            ) : null}
            <ul className="divide-y divide-border">
              {invoices.map((inv) => {
                const display = displayStatus(inv);
                return (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <Link
                      href={`/backoffice/facturen/${inv.id}`}
                      className="flex-1 hover:underline"
                    >
                      <div className="text-sm font-medium text-foreground">
                        #{String(inv.invoice_no).padStart(4, "0")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inv.due_date
                          ? `Vervalt ${fmtDate(inv.due_date)}`
                          : "Geen vervaldatum"}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {formatEuros(inv.total_cents)}
                      </span>
                      <Badge variant={DISPLAY_STATUS_VARIANT[display]}>
                        {DISPLAY_STATUS_LABEL[display]}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- Communication log ------------------------------------------------------

export function CommunicationCard({
  communications,
}: {
  communications: StudentCommunication[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Communicatie</CardTitle>
      </CardHeader>
      <CardContent>
        {communications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen e-mails of meldingen verstuurd.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {communications.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {c.subject || c.type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dtFmt.format(new Date(c.created_at))} · {c.channel}
                  </div>
                </div>
                <Badge
                  variant={
                    c.status === "sent"
                      ? "success"
                      : c.status === "failed"
                        ? "danger"
                        : c.status === "skipped"
                          ? "default"
                          : "info"
                  }
                >
                  {c.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Attention points / tasks -----------------------------------------------

export function TasksCard({ tasks }: { tasks: StudentLinkedTask[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aandachtspunten &amp; taken</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen open taken voor deze leerling.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {t.title}
                  </div>
                  {t.due_date ? (
                    <div className="text-xs text-muted-foreground">
                      Deadline {fmtDate(t.due_date)}
                    </div>
                  ) : null}
                </div>
                <Badge variant={TASK_PRIORITY_VARIANT[t.priority]}>
                  {TASK_PRIORITY_LABEL[t.priority]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Shared field helpers ---------------------------------------------------

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function FieldNode({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}
