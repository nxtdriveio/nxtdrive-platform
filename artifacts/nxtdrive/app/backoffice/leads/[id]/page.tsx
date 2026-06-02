import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTaskLaunchData } from "@/lib/tasks/launch-data";
import { CreateTaskFromEntityButton } from "@/app/backoffice/taken/create-task-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  INTAKE_APPLICANT_TYPE_LABEL,
  INTAKE_DAYPART_LABEL,
  INTAKE_LICENSE_GOAL_LABEL,
  INTAKE_PACE_LABEL,
  INTAKE_STATUS_LABEL,
  INTAKE_TRANSMISSION_LABEL,
  INTAKE_WEEKDAY_LABEL,
  LEAD_EVENT_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_VARIANT,
  type IntakeDaypart,
  type IntakeLicenseGoal,
  type IntakePace,
  type IntakeStatus,
  type IntakeTransmission,
  type IntakeWeekday,
  type Lead,
  type LeadEvent,
  type LeadIntakeDetail,
} from "@/lib/leads/types";
import {
  analyzeIntake,
  INTAKE_ATTENTION_CATEGORY_LABEL,
  INTAKE_LABEL_INFO,
  INTAKE_RECOMMENDED_STEP_LABEL,
  type IntakeAttentionPoint,
  type IntakeLabel,
  type IntakeRecommendedStep,
  type LeadIntakeAnalysis,
} from "@/lib/leads/intake-analysis";
import {
  addNote,
  convertLeadToStudent,
  markLeadLost,
  scheduleLeadFollowUp,
  updateStatus,
} from "../actions";
import {
  LEAD_ACTION_STATUS_LABEL,
  LEAD_ACTION_STATUS_VARIANT,
} from "@/lib/leads/types";
import { leadScoreBand } from "@/lib/leads/lead-score";
import type { LeadScoreReason } from "@/lib/leads/types";
import { formatEuros, type Package } from "@/lib/packages/types";
import { TrialLessonSection } from "./trial-lesson-section";
import { generateTrialLessonSuggestions } from "@/lib/trial-lessons/suggestions";
import type { TrialLesson, TrialSuggestion } from "@/lib/trial-lessons/types";

export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);

  const supabase = await createServerSupabaseClient();
  const { data: leadRaw } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!leadRaw) notFound();
  const lead = leadRaw as Lead;

  const taskLaunch = await loadTaskLaunchData(
    createServiceRoleClient(),
    tenant.id,
  );

  const { data: eventsRaw } = await supabase
    .from("lead_events")
    .select("id, lead_id, tenant_id, actor_user_id, event_type, payload, created_at")
    .eq("lead_id", id)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const events = (eventsRaw ?? []) as LeadEvent[];

  const { data: intakeRaw } = await supabase
    .from("lead_intake_details")
    .select("*")
    .eq("lead_id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  const intake = (intakeRaw ?? null) as LeadIntakeDetail | null;

  // Fase 1B — intake analysis. Read the stored analysis; if it is missing but
  // intake answers exist (e.g. leads created before this feature), compute and
  // persist it now (idempotent backfill) so the block always shows.
  let analysis: LeadIntakeAnalysis | null = null;
  if (intake) {
    const { data: analysisRaw } = await supabase
      .from("lead_intake_analysis")
      .select("*")
      .eq("lead_id", id)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    analysis = (analysisRaw ?? null) as LeadIntakeAnalysis | null;

    if (!analysis) {
      const computed = analyzeIntake({
        city: intake.city,
        pickup_location: intake.pickup_location,
        has_driving_experience: intake.has_driving_experience,
        had_lessons_before: intake.had_lessons_before,
        has_done_exam: intake.has_done_exam,
        theory_status: intake.theory_status,
        health_declaration_status: intake.health_declaration_status,
        cbr_authorization_status: intake.cbr_authorization_status,
        preferred_days: intake.preferred_days,
        preferred_times: intake.preferred_times,
        desired_start_date: intake.desired_start_date,
        lessons_per_week: intake.lessons_per_week,
        pace: intake.pace,
        has_anxiety: intake.has_anxiety,
      });
      await createServiceRoleClient().rpc("upsert_lead_intake_analysis", {
        p_lead_id: id,
        p_tenant_id: tenant.id,
        p_labels: computed.labels,
        p_score: computed.score,
        p_attention_points: computed.attention_points,
        p_summary: computed.summary,
        p_recommended_step: computed.recommended_step,
      });
      analysis = {
        id: "",
        lead_id: id,
        tenant_id: tenant.id,
        labels: computed.labels,
        score: computed.score,
        attention_points: computed.attention_points,
        summary: computed.summary,
        recommended_step: computed.recommended_step,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  }

  // For the "Klant maken" panel — only fetched when an admin views the page.
  const isAdmin = (await import("@/lib/auth/session")).rolesForTenant(
    (await (await import("@/lib/auth/require-role")).requireUser()),
    tenant.id,
  ).includes("tenant_admin");

  const { data: existingStudent } = await supabase
    .from("students")
    .select("id")
    .eq("lead_id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const { data: pkgRaw } = isAdmin && !existingStudent
    ? await supabase
        .from("packages")
        .select("id, name, credits_total, price_cents, active")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("credits_total", { ascending: true })
    : { data: null };
  const activePackages = (pkgRaw ?? []) as Pick<
    Package,
    "id" | "name" | "credits_total" | "price_cents" | "active"
  >[];

  // Fase 2 — Slimme Proeflesplanner. Trial lessons are tenant-readable via RLS.
  const { data: trialRaw } = await supabase
    .from("trial_lessons")
    .select(
      "id, lead_id, tenant_id, instructor_id, starts_at, ends_at, duration_min, status, pickup_location, score, reason, created_at, updated_at, pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address, route_status, route_travel_to_min, route_travel_from_min, route_needs_confirm",
    )
    .eq("lead_id", id)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });
  const trials = (trialRaw ?? []) as TrialLesson[];

  // Always surface the top suggestions for an open lead so the backoffice can
  // see the intake profile + the chosen moment + alternative moments together
  // (the suggestion engine excludes any slot that overlaps the active trial).
  let trialSuggestions: TrialSuggestion[] = [];
  if (!existingStudent) {
    trialSuggestions = await generateTrialLessonSuggestions(
      createServiceRoleClient(),
      id,
      3,
    );
  }

  // Resolve instructor display names (profiles RLS only exposes the caller's own
  // row, so read via service role bounded by this tenant's membership).
  const instructorNames: Record<string, string> = {};
  const instructorIds = Array.from(
    new Set([
      ...trials.map((t) => t.instructor_id),
      ...trialSuggestions.map((s) => s.instructor_id),
    ]),
  );
  if (instructorIds.length > 0) {
    const { data: profilesRaw } = await createServiceRoleClient()
      .from("profiles")
      .select("id, full_name")
      .in("id", instructorIds);
    for (const p of (profilesRaw ?? []) as {
      id: string;
      full_name: string | null;
    }[]) {
      instructorNames[p.id] = p.full_name ?? "Instructeur";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/backoffice/leads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Terug naar leads
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {lead.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Binnengekomen op {dateTimeFmt.format(new Date(lead.created_at))} via{" "}
            {LEAD_SOURCE_LABEL[lead.source]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateTaskFromEntityButton
            entityType="lead"
            entityId={lead.id}
            entityLabel={lead.full_name}
            boards={taskLaunch.boards}
            members={taskLaunch.members}
          />
          <Badge variant={LEAD_STATUS_VARIANT[lead.status]}>
            {LEAD_STATUS_LABEL[lead.status]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Contactgegevens</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <Field label="E-mail" value={lead.email} />
                <Field label="Telefoon" value={lead.phone} />
                <Field label="Postcode" value={lead.postcode} />
                <Field label="Bron" value={LEAD_SOURCE_LABEL[lead.source]} />
              </dl>
              {lead.message ? (
                <div className="mt-5">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Bericht
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
                    {lead.message}
                  </dd>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {analysis ? <IntakeAnalysisCard analysis={analysis} /> : null}

          {intake ? <IntakeCard intake={intake} /> : null}

          {!existingStudent ? (
            <TrialLessonSection
              leadId={lead.id}
              instructorNames={instructorNames}
              trials={trials}
              suggestions={trialSuggestions}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Notitie toevoegen</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addNote} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <Textarea
                  name="note"
                  required
                  maxLength={2000}
                  placeholder="Wat is er besproken? Volgende stap?"
                />
                <Button type="submit" size="sm">
                  Notitie opslaan
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historie</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen activiteit.
                </p>
              ) : (
                <ol className="space-y-3">
                  {events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm"
                    >
                      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {LEAD_EVENT_LABEL[ev.event_type]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {dateTimeFmt.format(new Date(ev.created_at))}
                          </span>
                        </div>
                        <EventDetail event={ev} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <SmartFollowUpCard lead={lead} />

          <Card>
            <CardHeader>
              <CardTitle>Status bijwerken</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateStatus} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <Select name="status" defaultValue={lead.status}>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" className="w-full">
                  Status opslaan
                </Button>
              </form>
            </CardContent>
          </Card>

          {isAdmin ? (
            existingStudent ? (
              <Card>
                <CardHeader>
                  <CardTitle>Klant</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Deze lead is al omgezet naar een leerling.
                  </p>
                  <Link
                    href={`/backoffice/leerlingen/${existingStudent.id}`}
                    className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    Naar leerlingprofiel →
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Klant maken</CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={convertLeadToStudent} className="space-y-3">
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <div className="space-y-1.5">
                      <label
                        htmlFor="package_id"
                        className="text-xs uppercase tracking-wide text-muted-foreground"
                      >
                        Pakket (optioneel)
                      </label>
                      <Select
                        id="package_id"
                        name="package_id"
                        defaultValue=""
                      >
                        <option value="">Geen pakket — alleen leerling aanmaken</option>
                        {activePackages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.credits_total} credits ·{" "}
                            {formatEuros(p.price_cents)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button type="submit" size="sm" className="w-full">
                      Leerling aanmaken
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Zet de lead op{" "}
                      <span className="text-foreground">Klant geworden</span> en
                      kent eventueel het pakket toe.
                    </p>
                  </form>
                </CardContent>
              </Card>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SmartFollowUpCard({ lead }: { lead: Lead }) {
  const reasons = Array.isArray(lead.lead_score_reason)
    ? (lead.lead_score_reason as LeadScoreReason[])
    : [];
  const band = leadScoreBand(lead.lead_score);
  const scoreVariant =
    band === "hot" ? "warning" : band === "warm" ? "info" : "default";
  const isClosed = lead.status === "converted" || lead.status === "dropped";
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slimme opvolging</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Leadscore
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {lead.lead_score}
              </span>
              <Badge variant={scoreVariant}>
                {band === "hot" ? "Hot" : band === "warm" ? "Warm" : "Koud"}
              </Badge>
            </div>
          </div>
          <Badge variant={LEAD_ACTION_STATUS_VARIANT[lead.action_status]}>
            {LEAD_ACTION_STATUS_LABEL[lead.action_status]}
          </Badge>
        </div>

        {lead.next_action_at ? (
          <div className="text-sm text-muted-foreground">
            Volgende actie:{" "}
            <span className="font-medium text-foreground">
              {dateTimeFmt.format(new Date(lead.next_action_at))}
            </span>
          </div>
        ) : null}

        {reasons.length > 0 ? (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Signalen
            </div>
            <ul className="space-y-1">
              {reasons.map((r) => (
                <li
                  key={r.code}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-foreground">{r.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    +{r.points}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isClosed ? (
          <div className="space-y-3 border-t border-border pt-3">
            <form action={scheduleLeadFollowUp} className="space-y-2">
              <input type="hidden" name="lead_id" value={lead.id} />
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Later opvolgen
              </label>
              <div className="flex gap-2">
                <Input type="date" name="date" defaultValue={todayIso} required />
                <Input type="time" name="time" defaultValue="09:00" />
              </div>
              <Button type="submit" size="sm" variant="outline" className="w-full">
                Opvolging plannen
              </Button>
            </form>

            <form action={markLeadLost} className="space-y-2">
              <input type="hidden" name="lead_id" value={lead.id} />
              <Input name="reason" placeholder="Reden afhaken (optioneel)" />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="w-full text-danger"
              >
                Markeer als afgehaakt
              </Button>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function yesNoUnknown(v: boolean | null | undefined): string {
  if (v === true) return "Ja";
  if (v === false) return "Nee";
  return "Onbekend";
}

const intakeDateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? value : intakeDateFmt.format(new Date(t));
}

function IntakeAnalysisCard({ analysis }: { analysis: LeadIntakeAnalysis }) {
  const labels = analysis.labels.filter(
    (l): l is IntakeLabel => l in INTAKE_LABEL_INFO,
  );
  const points = analysis.attention_points as IntakeAttentionPoint[];
  const step =
    analysis.recommended_step in INTAKE_RECOMMENDED_STEP_LABEL
      ? INTAKE_RECOMMENDED_STEP_LABEL[
          analysis.recommended_step as IntakeRecommendedStep
        ]
      : analysis.recommended_step;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Intake-analyse</CardTitle>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
            Aandachtsscore
            <span className="font-semibold text-primary">{analysis.score}</span>
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed text-foreground">
          {analysis.summary}
        </p>

        {labels.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              Labels
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <Badge key={l} variant={INTAKE_LABEL_INFO[l].variant}>
                  {INTAKE_LABEL_INFO[l].label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Aandachtspunten
          </h3>
          {points.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen bijzondere aandachtspunten.
            </p>
          ) : (
            <ul className="space-y-2">
              {points.map((p) => (
                <li
                  key={p.code}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-2.5 text-sm"
                >
                  <div className="flex-1">
                    <span className="text-foreground">{p.label}</span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                      {INTAKE_ATTENTION_CATEGORY_LABEL[p.category] ?? p.category}
                    </span>
                  </div>
                  <span className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-warning">
                    +{p.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Aanbevolen vervolgstap
          </h3>
          <p className="inline-flex items-center rounded-md bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary">
            {step}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function IntakeCard({ intake }: { intake: LeadIntakeDetail }) {
  const days = intake.preferred_days
    .map((d) => INTAKE_WEEKDAY_LABEL[d as IntakeWeekday] ?? d)
    .join(", ");
  const times = intake.preferred_times
    .map((t) => INTAKE_DAYPART_LABEL[t as IntakeDaypart] ?? t)
    .join(", ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Intake-gegevens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section title="Persoon">
          <Field
            label="Aanmelder"
            value={INTAKE_APPLICANT_TYPE_LABEL[intake.applicant_type]}
          />
          <Field label="Geboortedatum" value={fmtDate(intake.date_of_birth)} />
          <Field label="Woonplaats" value={intake.city} />
          <Field label="Wijk / ophaallocatie" value={intake.pickup_location} />
        </Section>

        <Section title="Rijopleiding">
          <Field
            label="Rijbewijsdoel"
            value={
              intake.license_goal
                ? INTAKE_LICENSE_GOAL_LABEL[intake.license_goal as IntakeLicenseGoal]
                : null
            }
          />
          <Field
            label="Schakel / automaat"
            value={
              intake.transmission
                ? INTAKE_TRANSMISSION_LABEL[intake.transmission as IntakeTransmission]
                : null
            }
          />
          <Field
            label="Al rijervaring"
            value={yesNoUnknown(intake.has_driving_experience)}
          />
          <Field
            label="Eerder rijles gehad"
            value={yesNoUnknown(intake.had_lessons_before)}
          />
          <Field label="Al examen gedaan" value={yesNoUnknown(intake.has_done_exam)} />
          <Field
            label="Theorie gehaald"
            value={INTAKE_STATUS_LABEL[intake.theory_status as IntakeStatus]}
          />
          <Field
            label="Gezondheidsverklaring"
            value={INTAKE_STATUS_LABEL[intake.health_declaration_status as IntakeStatus]}
          />
          <Field
            label="CBR-machtiging"
            value={INTAKE_STATUS_LABEL[intake.cbr_authorization_status as IntakeStatus]}
          />
        </Section>

        <Section title="Beschikbaarheid">
          <Field label="Voorkeursdagen" value={days || null} />
          <Field label="Voorkeurstijden" value={times || null} />
          <Field
            label="Gewenste startdatum"
            value={fmtDate(intake.desired_start_date)}
          />
          <Field
            label="Lessen per week"
            value={
              intake.lessons_per_week != null ? String(intake.lessons_per_week) : null
            }
          />
        </Section>
        {intake.weekly_availability ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Beschikbaarheid per week
            </dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
              {intake.weekly_availability}
            </dd>
          </div>
        ) : null}

        <Section title="Leerprofiel">
          <Field
            label="Tempo"
            value={intake.pace ? INTAKE_PACE_LABEL[intake.pace as IntakePace] : null}
          />
          <Field label="Faalangst" value={yesNoUnknown(intake.has_anxiety)} />
        </Section>
        {intake.remarks ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Bijzonderheden
            </dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
              {intake.remarks}
            </dd>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
        {title}
      </h3>
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function EventDetail({ event }: { event: LeadEvent }) {
  const p = event.payload ?? {};
  if (event.event_type === "status_changed") {
    const from = String((p as Record<string, unknown>).from ?? "");
    const to = String((p as Record<string, unknown>).to ?? "");
    return (
      <p className="text-xs text-muted-foreground">
        Van <span className="text-foreground">{LEAD_STATUS_LABEL[from as keyof typeof LEAD_STATUS_LABEL] ?? from}</span>{" "}
        naar{" "}
        <span className="text-foreground">{LEAD_STATUS_LABEL[to as keyof typeof LEAD_STATUS_LABEL] ?? to}</span>
      </p>
    );
  }
  if (event.event_type === "note") {
    const note = String((p as Record<string, unknown>).note ?? "");
    return (
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{note}</p>
    );
  }
  if (event.event_type === "created") {
    const source = String((p as Record<string, unknown>).source ?? "");
    return (
      <p className="text-xs text-muted-foreground">
        Aangemaakt via {LEAD_SOURCE_LABEL[source as keyof typeof LEAD_SOURCE_LABEL] ?? source}
      </p>
    );
  }
  return null;
}
