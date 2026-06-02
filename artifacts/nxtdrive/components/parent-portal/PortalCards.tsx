import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ADVICE_LABELS,
  PHASE_LABELS,
  type ReadinessResult,
} from "@workspace/leskaart";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
} from "@/lib/lessons/types";
import { APPOINTMENT_TYPE_LABEL } from "@/lib/agenda/types";
import type { AgendaAppointment } from "@/lib/agenda/types";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  displayStatus,
  formatEuros,
  type Invoice,
} from "@/lib/invoices/types";
import {
  CREDIT_REASON_LABEL,
  formatTegoed,
  formatTegoedDelta,
  type CreditLedgerRow,
} from "@/lib/students/types";
import type { CbrChecklistItem, StudentCbrStatus } from "@/lib/cbr/types";
import {
  DOCUMENT_CATEGORY_LABEL,
  formatFileSize,
} from "@/lib/students/document-types";
import type {
  PortalDocument,
  PortalLesson,
  PortalPackage,
} from "@/lib/parent-portal/data";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function SectionDisabledCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyRow>
          Deze rijschool heeft dit onderdeel niet beschikbaar gesteld in het
          ouderportaal.
        </EmptyRow>
      </CardContent>
    </Card>
  );
}

export function NoChildCard() {
  return (
    <Card>
      <CardContent className="pt-6">
        <EmptyRow>
          Er zijn nog geen leerlingen aan je account gekoppeld. Neem contact op
          met de rijschool.
        </EmptyRow>
      </CardContent>
    </Card>
  );
}

function LessonRow({ lesson }: { lesson: PortalLesson }) {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium capitalize text-foreground">
          {dateFmt.format(start)} · {timeFmt.format(start)}–{timeFmt.format(end)}
        </div>
        {lesson.location ? (
          <div className="truncate text-xs text-muted-foreground">
            {lesson.location}
          </div>
        ) : null}
      </div>
      <Badge variant={LESSON_STATUS_VARIANT[lesson.status]}>
        {LESSON_STATUS_LABEL[lesson.status]}
      </Badge>
    </li>
  );
}

function AppointmentRow({ appt }: { appt: AgendaAppointment }) {
  const start = new Date(appt.starts_at);
  const end = new Date(appt.ends_at);
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium capitalize text-foreground">
          {appt.title ?? APPOINTMENT_TYPE_LABEL[appt.type]}
        </div>
        <div className="text-xs text-muted-foreground">
          {dateFmt.format(start)} · {timeFmt.format(start)}–
          {timeFmt.format(end)}
          {appt.location ? ` · ${appt.location}` : ""}
        </div>
      </div>
      <Badge variant="info">{APPOINTMENT_TYPE_LABEL[appt.type]}</Badge>
    </li>
  );
}

export function PortalPlanningCard({
  upcomingLessons,
  pastLessons = [],
  appointments,
  pastAppointments = [],
}: {
  upcomingLessons: PortalLesson[];
  pastLessons?: PortalLesson[];
  appointments: AgendaAppointment[];
  pastAppointments?: AgendaAppointment[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Geplande lessen
          </h3>
          {upcomingLessons.length === 0 ? (
            <EmptyRow>Geen geplande lessen.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {upcomingLessons.map((l) => (
                <LessonRow key={l.id} lesson={l} />
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Geplande afspraken
          </h3>
          {appointments.length === 0 ? (
            <EmptyRow>Geen geplande afspraken.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {appointments.map((a) => (
                <AppointmentRow key={a.id} appt={a} />
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Afgelopen lessen
          </h3>
          {pastLessons.length === 0 ? (
            <EmptyRow>Nog geen afgelopen lessen.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {pastLessons.map((l) => (
                <LessonRow key={l.id} lesson={l} />
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Afgelopen afspraken
          </h3>
          {pastAppointments.length === 0 ? (
            <EmptyRow>Nog geen afgelopen afspraken.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {pastAppointments.map((a) => (
                <AppointmentRow key={a.id} appt={a} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReadinessRing({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (safe / 100) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" aria-hidden>
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-muted"
        strokeWidth="10"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-primary"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="55"
        textAnchor="middle"
        className="fill-foreground text-[20px] font-bold"
      >
        {Math.round(safe)}%
      </text>
    </svg>
  );
}

export function PortalVoortgangCard({
  readiness,
  lessonHistory,
}: {
  readiness: ReadinessResult;
  lessonHistory: PortalLesson[];
}) {
  const scored = lessonHistory.filter((l) => l.progress_score != null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Voortgang</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <ReadinessRing pct={readiness.readinessPct} />
          <div className="flex-1 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Advies</span>
              <span className="font-semibold text-foreground">
                {ADVICE_LABELS[readiness.advice]}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Fase</span>
              <span className="font-medium text-foreground">
                {PHASE_LABELS[readiness.phase]}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Gemiddelde score</span>
              <span className="font-medium tabular-nums text-foreground">
                {readiness.averageScore.toFixed(1)} / 10
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{readiness.disclaimer}</p>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recente lessen
          </h3>
          {scored.length === 0 ? (
            <EmptyRow>Nog geen beoordeelde lessen.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {scored.slice(0, 10).map((l) => {
                const start = new Date(l.starts_at);
                return (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="text-sm capitalize text-foreground">
                      {dateFmt.format(start)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {l.progress_score} / 10
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PortalExamensCard({
  cbrStatus,
  cbrChecklist,
  examAppointments,
}: {
  cbrStatus: StudentCbrStatus | null;
  cbrChecklist: CbrChecklistItem[];
  examAppointments: AgendaAppointment[];
}) {
  const statusRows: { label: string; ok: boolean }[] = cbrStatus
    ? [
        { label: "Theorie behaald", ok: cbrStatus.theorie_behaald },
        { label: "Machtiging geregeld", ok: cbrStatus.machtiging_geregeld },
        ...(cbrStatus.gezondheidsverklaring_vereist
          ? [
              {
                label: "Gezondheidsverklaring geregeld",
                ok: cbrStatus.gezondheidsverklaring_geregeld,
              },
            ]
          : []),
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Examens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            CBR-status
          </h3>
          {statusRows.length === 0 ? (
            <EmptyRow>Nog geen CBR-status geregistreerd.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {statusRows.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="text-sm text-foreground">{row.label}</span>
                  <Badge variant={row.ok ? "success" : "warning"}>
                    {row.ok ? "Geregeld" : "Open"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cbrChecklist.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Praktijkonderdelen
            </h3>
            <ul className="divide-y divide-border">
              {cbrChecklist.map((item) => (
                <li
                  key={item.competency.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="text-sm text-foreground">
                    {item.competency.label}
                  </span>
                  <Badge variant={item.achieved ? "success" : "default"}>
                    {item.achieved ? "Behaald" : "Nog niet"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Geplande (tussen)examens
          </h3>
          {examAppointments.length === 0 ? (
            <EmptyRow>Geen geplande examens.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {examAppointments.map((a) => (
                <AppointmentRow key={a.id} appt={a} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PortalFacturenCard({
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
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Openstaand</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatEuros(outstandingCents)}
          </span>
        </div>
        {invoices.length === 0 ? (
          <EmptyRow>Geen facturen.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => {
              const ds = displayStatus(inv);
              return (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      Factuur #{inv.invoice_no}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dayFmt.format(new Date(inv.created_at))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatEuros(inv.total_cents)}
                    </span>
                    <Badge variant={DISPLAY_STATUS_VARIANT[ds]}>
                      {DISPLAY_STATUS_LABEL[ds]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Online betalen verloopt niet via het ouderportaal.
        </p>
      </CardContent>
    </Card>
  );
}

export function PortalBetalingenCard({
  paidInvoices,
  paidTotalCents,
}: {
  paidInvoices: Invoice[];
  paidTotalCents: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Betalingen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Totaal betaald</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatEuros(paidTotalCents)}
          </span>
        </div>
        {paidInvoices.length === 0 ? (
          <EmptyRow>Nog geen betalingen geregistreerd.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {paidInvoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    Factuur #{inv.invoice_no}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {inv.paid_at
                      ? `Betaald op ${dayFmt.format(new Date(inv.paid_at))}`
                      : "Betaald"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatEuros(inv.total_cents)}
                  </span>
                  <Badge variant="success">Betaald</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Online betalen verloopt niet via het ouderportaal.
        </p>
      </CardContent>
    </Card>
  );
}

export function PortalPakketinformatieCard({
  packages,
}: {
  packages: PortalPackage[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pakketinformatie</CardTitle>
      </CardHeader>
      <CardContent>
        {packages.length === 0 ? (
          <EmptyRow>Nog geen lespakketten toegekend.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {packages.map((p) => (
              <li
                key={p.ledgerId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {p.name ?? "Lespakket"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Toegekend op {dayFmt.format(new Date(p.grantedAt))} ·{" "}
                    {formatTegoed(p.minutes)}
                  </div>
                </div>
                {p.priceCents != null ? (
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatEuros(p.priceCents)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PortalDocumentenCard({
  documents,
}: {
  documents: PortalDocument[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documenten</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <EmptyRow>
            Er zijn nog geen documenten gedeeld voor je kind.
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {doc.fileName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {DOCUMENT_CATEGORY_LABEL[doc.category]} ·{" "}
                    {formatFileSize(doc.sizeBytes)} ·{" "}
                    {dayFmt.format(new Date(doc.createdAt))}
                  </div>
                </div>
                <a
                  href={`/ouder/documenten/${doc.id}`}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  Downloaden
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PortalTegoedCard({
  balance,
  ledger,
}: {
  balance: number;
  ledger: CreditLedgerRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lestegoed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Huidig saldo</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatTegoed(balance)}
          </span>
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mutaties
          </h3>
          {ledger.length === 0 ? (
            <EmptyRow>Nog geen mutaties.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {ledger.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">
                      {CREDIT_REASON_LABEL[row.reason]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dayFmt.format(new Date(row.created_at))}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      row.delta >= 0 ? "text-success" : "text-foreground"
                    }`}
                  >
                    {formatTegoedDelta(row.delta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
