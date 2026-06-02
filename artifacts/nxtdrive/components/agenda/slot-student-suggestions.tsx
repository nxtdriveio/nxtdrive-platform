import Link from "next/link";
import { Sparkles, Car, Clock, AlertTriangle, UserPlus } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { suggestSlotCandidates } from "@/lib/lesson-planning/candidates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatTegoed } from "@/lib/students/types";

// ---------------------------------------------------------------------------
// Task #87 / #92 — "Slim herbezetten" for a freed slot. Advisory only: shows
// ranked candidate STUDENTS and trial-wanting LEADS with a score + reasoning,
// each with a button into the existing scheduling / trial flow (the planner
// confirms). Reads only, tenant-scoped via RLS — nothing is auto-booked.
// ---------------------------------------------------------------------------

type Props = {
  tenantId: string;
  instructorId: string;
  instructorName?: string;
  startsAt: string; // ISO
  durationMin: number;
  excludeAppointmentId?: string;
};

function routeLabel(
  status: "computed" | "estimated" | "unavailable",
): { text: string; tone: "success" | "warning" | "default" } {
  if (status === "computed")
    return { text: "Reistijd berekend", tone: "success" };
  if (status === "estimated")
    return { text: "Reistijd geschat — controleer", tone: "warning" };
  return { text: "Geen reisinfo", tone: "default" };
}

export async function SlotStudentSuggestions({
  tenantId,
  instructorId,
  instructorName,
  startsAt,
  durationMin,
  excludeAppointmentId,
}: Props) {
  const supabase = await createServerSupabaseClient();
  const { students, leads } = await suggestSlotCandidates(supabase, {
    tenantId,
    instructorId,
    startsAt,
    durationMin,
    excludeAppointmentId,
  });

  const date = startsAt.slice(0, 10);
  const time = startsAt.slice(11, 16);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Slim herbezetten
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Adviserend — gerangschikt op beschikbaarheid, voorkeuren,
          regio/reistijd, examenplanning en urgentie. Jij kiest en bevestigt
          zelf.
        </p>

        {/* Students --------------------------------------------------------- */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Bestaande leerlingen
          </h3>
          {students.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Geen passende leerlingen voor dit moment. Leerlingen zonder
              voldoende tegoed, die al bezet zijn of niet bereikbaar binnen de
              reistijd worden niet voorgesteld.
            </p>
          ) : (
            <ul className="space-y-3">
              {students.map((c) => {
                const planHref =
                  `/backoffice/agenda/nieuw?student_id=${encodeURIComponent(c.student_id)}` +
                  `&instructor_id=${encodeURIComponent(instructorId)}` +
                  `&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}` +
                  `&duration_min=${durationMin}`;
                const rl = c.route ? routeLabel(c.route.status) : null;
                return (
                  <li
                    key={c.student_id}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {c.full_name}
                        </span>
                        <Badge variant="primary">{c.score} ptn</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.reason}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          Saldo: {formatTegoed(c.balance_min)}
                        </span>
                        {c.route && c.route.travel_to_min !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Car className="h-3.5 w-3.5" aria-hidden />
                            {c.route.travel_to_min} min vanaf vorige
                          </span>
                        ) : null}
                        {rl ? (
                          <span className="inline-flex items-center gap-1">
                            {c.route?.needs_manual_confirm ? (
                              <AlertTriangle
                                className="h-3.5 w-3.5 text-warning"
                                aria-hidden
                              />
                            ) : null}
                            <Badge variant={rl.tone}>{rl.text}</Badge>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={planHref}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Plan in →
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Leads (trial lesson) -------------------------------------------- */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Leads — proefles
          </h3>
          {leads.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Geen passende leads voor een proefles op dit moment.
            </p>
          ) : (
            <ul className="space-y-3">
              {leads.map((c) => {
                const planHref =
                  `/backoffice/leads/${encodeURIComponent(c.lead_id)}` +
                  `?trial_start=${encodeURIComponent(startsAt)}` +
                  `&trial_duration=${c.trial_duration_min}` +
                  `&trial_instructor=${encodeURIComponent(instructorId)}` +
                  (instructorName
                    ? `&trial_instructor_name=${encodeURIComponent(instructorName)}`
                    : "");
                const rl = c.route ? routeLabel(c.route.status) : null;
                return (
                  <li
                    key={c.lead_id}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {c.full_name}
                        </span>
                        <Badge variant="primary">{c.score} ptn</Badge>
                        <Badge variant="default">Proefles</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.reason}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {c.trial_duration_min} min proefles
                        </span>
                        {c.pickup_location ? (
                          <span className="inline-flex items-center gap-1">
                            <Car className="h-3.5 w-3.5" aria-hidden />
                            {c.pickup_location}
                          </span>
                        ) : null}
                        {rl ? (
                          <span className="inline-flex items-center gap-1">
                            {c.route?.needs_manual_confirm ? (
                              <AlertTriangle
                                className="h-3.5 w-3.5 text-warning"
                                aria-hidden
                              />
                            ) : null}
                            <Badge variant={rl.tone}>{rl.text}</Badge>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={planHref}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Plan in →
                    </Link>
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
