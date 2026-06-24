import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  CreditCard,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { PWAPage, PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";
import {
  StudentInitialBadge,
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { getActiveStudent } from "@/lib/students/access";
import { createNlDateTimeFormatter, resolveTenantTimeZone } from "@/lib/datetime";
import { formatTegoed } from "@/lib/students/types";
import { loadStudentSelfBookingState } from "@/lib/student-booking/service";
import { selfBookLesson } from "../../actions";

export const dynamic = "force-dynamic";

function cleanDuration(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 15 && n <= 240 ? n : null;
}

function statusCopy(status: string | null): string | null {
  if (status === "requested") {
    return "Je aanvraag is verstuurd. Je rijschool bevestigt het moment zodra de benodigde controles akkoord zijn.";
  }
  return null;
}

export default async function StudentBookLessonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { tenant, user, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  if (needsChildPicker) redirect("/student/select-child");

  const timeZone = resolveTenantTimeZone(tenant);
  const dateFmt = createNlDateTimeFormatter(
    { weekday: "short", day: "numeric", month: "short" },
    timeZone,
  );
  const timeFmt = createNlDateTimeFormatter(
    { hour: "2-digit", minute: "2-digit" },
    timeZone,
  );

  if (!student) {
    return (
      <PWAPage app="student" contentClassName="space-y-3.5">
        <PWAPageHeader
          eyebrow="Planning"
          title="Nieuwe les"
          subtitle="Je account is nog niet gekoppeld aan een leerlingdossier."
          icon={<CalendarPlus className="h-4 w-4" aria-hidden />}
        />
        <StudentShowcaseCard>
          <PWAEmptyState message="Vraag je rijschool om je account aan je leerlingdossier te koppelen." />
        </StudentShowcaseCard>
      </PWAPage>
    );
  }

  const service = createServiceRoleClient();
  const state = await loadStudentSelfBookingState(service, {
    tenantId: tenant.id,
    tenantTimeZone: tenant.timezone,
    student,
    actorUserId: user.id,
    roles,
    requestedDurationMin: cleanDuration(params.duration),
  });
  const error = typeof params.error === "string" ? params.error : null;
  const success = statusCopy(typeof params.status === "string" ? params.status : null);
  const requestMode =
    state.requiresApproval || state.sendsRequestWhenInsufficientCredit;

  return (
    <PWAPage app="student" contentClassName="space-y-3.5">
      <PWAPageHeader
        eyebrow="Planning"
        title="Nieuwe les plannen"
        subtitle="Kies een beschikbaar moment. Je rijschoolregels, pakket en tegoed worden direct gecontroleerd."
        icon={<CalendarPlus className="h-4 w-4" aria-hidden />}
        actions={
          <Link
            href="/student/lessons"
            className="inline-flex h-9 items-center rounded-full border border-brand-border bg-white px-3 text-xs font-semibold text-brand-foreground"
          >
            Terug
          </Link>
        }
      />

      {error ? (
        <StudentShowcaseNotice
          tone="danger"
          title="Niet geboekt"
          description={error}
          icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
        />
      ) : null}
      {success ? (
        <StudentShowcaseNotice
          tone="success"
          title="Aanvraag verstuurd"
          description={success}
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
        />
      ) : null}

      <StudentShowcaseCard
        title="Boekingsregels"
        eyebrow="Jouw situatie"
        info="Deze controles komen uit je rijschoolinstellingen, pakket, open facturen en tegoed."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-[1rem] border border-brand-border bg-white px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-muted-foreground">
              <CreditCard className="h-4 w-4 text-brand-primary" aria-hidden />
              Tegoed
            </div>
            <div className="mt-1 text-lg font-black text-brand-foreground">
              {formatTegoed(state.balanceMinutes)}
            </div>
          </div>
          <div className="rounded-[1rem] border border-brand-border bg-white px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-muted-foreground">
              <Clock3 className="h-4 w-4 text-brand-primary" aria-hidden />
              Lesduur
            </div>
            <div className="mt-1 text-lg font-black text-brand-foreground">
              {state.selectedDurationMin} min
            </div>
          </div>
          <div className="rounded-[1rem] border border-brand-border bg-white px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-brand-primary" aria-hidden />
              Bevestiging
            </div>
            <div className="mt-1 text-sm font-bold text-brand-foreground">
              {requestMode ? "Aanvraag" : "Direct boeken"}
            </div>
          </div>
        </div>

        {state.durationOptions.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {state.durationOptions.map((duration) => (
              <Link
                key={duration}
                href={`/student/lessons/book?duration=${duration}`}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  duration === state.selectedDurationMin
                    ? "border-brand-primary/40 bg-brand-accent text-brand-primary"
                    : "border-brand-border bg-white text-brand-muted-foreground",
                ].join(" ")}
              >
                {duration} min
              </Link>
            ))}
          </div>
        ) : null}

        {state.latestPackage ? (
          <p className="mt-3 text-xs leading-5 text-brand-muted-foreground">
            Actief pakket:{" "}
            <span className="font-semibold text-brand-foreground">
              {state.latestPackage.name}
            </span>
          </p>
        ) : null}
      </StudentShowcaseCard>

      {state.helperMessages.length > 0 ? (
        <div className="space-y-2">
          {state.helperMessages.map((message) => (
            <StudentShowcaseNotice
              key={message}
              tone="warning"
              title="Let op"
              description={message}
              icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
            />
          ))}
        </div>
      ) : null}

      {state.blockingReasons.length > 0 ? (
        <StudentShowcaseCard title="Nog niet mogelijk" eyebrow="Controle">
          <div className="space-y-2">
            {state.blockingReasons.map((reason) => (
              <div
                key={reason}
                className="rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900"
              >
                {reason}
              </div>
            ))}
          </div>
        </StudentShowcaseCard>
      ) : null}

      {state.blockingReasons.length === 0 ? (
        <StudentShowcaseCard
          title={requestMode ? "Beschikbare aanvragen" : "Beschikbare momenten"}
          eyebrow="Slimme suggesties"
          info="Deze momenten zijn gecontroleerd op instructeur, vestiging, beschikbaarheid en overlap."
        >
          {state.suggestions.length === 0 ? (
            <PWAEmptyState
              icon={<CalendarPlus className="h-6 w-6" aria-hidden />}
              title="Geen passend moment gevonden"
              message="Er zijn binnen je huidige regels geen vrije momenten gevonden. Probeer een andere lesduur of neem contact op met je rijschool."
            />
          ) : (
            <div className="space-y-2.5">
              {state.suggestions.map((suggestion) => {
                const start = new Date(suggestion.startsAt);
                const end = new Date(suggestion.endsAt);
                const primaryReason =
                  suggestion.reasons[0] ?? "Passend binnen de planning";
                return (
                  <form
                    key={`${suggestion.instructorId}-${suggestion.startsAt}`}
                    action={selfBookLesson}
                    className="rounded-[1.15rem] border border-brand-border bg-white px-3 py-3"
                  >
                    <input type="hidden" name="instructor_id" value={suggestion.instructorId} />
                    <input type="hidden" name="starts_at" value={suggestion.startsAt} />
                    <input type="hidden" name="duration_min" value={suggestion.durationMin} />
                    <input type="hidden" name="score" value={suggestion.score} />
                    <input type="hidden" name="reason" value={suggestion.reasons.join(", ")} />
                    <input type="hidden" name="warnings" value={JSON.stringify(suggestion.warnings)} />

                    <div className="flex min-w-0 items-start gap-3">
                      <StudentInitialBadge
                        label={String(Math.round(suggestion.score))}
                        tone={suggestion.warnings.length > 0 ? "orange" : "blue"}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-brand-foreground">
                            {dateFmt.format(start)} - {timeFmt.format(start)} - {timeFmt.format(end)}
                          </p>
                          <span className="rounded-full bg-brand-accent px-2 py-0.5 text-[10px] font-bold text-brand-primary">
                            {suggestion.durationMin} min
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-brand-muted-foreground">
                          {suggestion.instructorName} - {primaryReason}
                        </p>
                        {suggestion.warnings.length > 0 ? (
                          <p className="mt-1 text-xs leading-5 text-amber-700">
                            {suggestion.warnings[0]}
                          </p>
                        ) : null}
                        <label className="mt-3 flex min-w-0 items-center gap-2 rounded-full border border-brand-border bg-brand-muted/45 px-3 py-2 text-xs text-brand-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                          <input
                            name="location"
                            type="text"
                            placeholder={student.postcode ? `Ophaallocatie, bv. ${student.postcode}` : "Ophaallocatie optioneel"}
                            className="min-w-0 flex-1 bg-transparent text-brand-foreground outline-none placeholder:text-brand-muted-foreground"
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full bg-brand-primary px-4 text-sm font-bold text-brand-primary-foreground transition hover:opacity-90"
                    >
                      {requestMode ? "Aanvraag versturen" : "Les boeken"}
                    </button>
                  </form>
                );
              })}
            </div>
          )}
        </StudentShowcaseCard>
      ) : null}

      <p className="px-1 text-xs leading-5 text-brand-muted-foreground">
        Tijden worden getoond in de tijdzone van je rijschool. Je rijschool kan
        zelf boeken per pakket, tegoed en goedkeuring beperken.
      </p>
    </PWAPage>
  );
}
