import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  TRIAL_LESSON_DURATIONS,
  TRIAL_LESSON_STATUS_LABEL,
  TRIAL_LESSON_STATUS_VARIANT,
  type TrialLesson,
  type TrialRouteInsight,
  type TrialSuggestion,
} from "@/lib/trial-lessons/types";
import {
  bookTrialAtSlot,
  confirmTrialBookingPreference,
  confirmTrialLesson,
  rejectTrialLesson,
  respondTrialBookingConfirmation,
  rescheduleTrialLesson,
} from "../actions";
import { TrialRouteMap, type MapPoint } from "@/components/trial-route-map";
import type {
  BookingCandidatePreferenceView,
  BookingConfirmationView,
} from "@/lib/smart-booking/types";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const slotFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Fase 3 — render the route insight for a slot/trial: travel times to/from the
// adjacent appointments + a flag when the route could not be confirmed.
function RouteInsight({
  route,
  needsConfirm,
}: {
  route: TrialRouteInsight;
  needsConfirm?: boolean;
}) {
  const parts: string[] = [];
  if (route.travel_to_min != null) {
    parts.push(`${route.travel_to_min} min vanaf vorige`);
  }
  if (route.travel_from_min != null) {
    parts.push(`${route.travel_from_min} min naar volgende`);
  }
  const flagged = needsConfirm ?? route.needs_manual_confirm;

  if (parts.length === 0 && route.status === "unavailable" && !flagged) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {parts.length > 0 ? (
        <span className="text-muted-foreground">
          Reistijd: {parts.join(" · ")}
          {route.status === "estimated" ? " (schatting)" : ""}
        </span>
      ) : route.status === "unavailable" ? (
        <span className="text-muted-foreground">
          Geen reistijd te bepalen (geen ophaalcoördinaten)
        </span>
      ) : null}
      {flagged ? (
        <Badge variant="warning">Route controleren</Badge>
      ) : null}
    </div>
  );
}

// yyyy-mm-dd / HH:mm in UTC (matches how slots are generated/stored).
function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
function toTimeInput(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

export function TrialLessonSection({
  leadId,
  instructorNames,
  trials,
  suggestions,
  selectedPreferences,
  confirmations,
  activeTrialMapPoints,
}: {
  leadId: string;
  instructorNames: Record<string, string>;
  trials: TrialLesson[];
  suggestions: TrialSuggestion[];
  selectedPreferences: BookingCandidatePreferenceView[];
  confirmations: BookingConfirmationView[];
  activeTrialMapPoints?: MapPoint[];
}) {
  const active = trials.find(
    (t) => t.status === "provisional" || t.status === "confirmed",
  );
  const history = trials.filter((t) => t.id !== active?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proefles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {active ? (
          <ActiveTrial
            leadId={leadId}
            trial={active}
            instructorName={instructorNames[active.instructor_id] ?? "Instructeur"}
            mapPoints={activeTrialMapPoints}
          />
        ) : null}

        <SelectedPreferencesList
          leadId={leadId}
          preferences={selectedPreferences}
          confirmations={confirmations}
          instructorNames={instructorNames}
          hasActive={!!active}
        />

        {/* Always show the current suggestions: when nothing is chosen they are
            the options; when a moment is chosen they are alternatives. */}
        <SuggestionsList
          leadId={leadId}
          suggestions={suggestions}
          instructorNames={instructorNames}
          hasActive={!!active}
        />

        {history.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Eerdere proeflesmomenten
            </h3>
            <ul className="space-y-2">
              {history.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="text-foreground">
                    {cap(dateTimeFmt.format(new Date(t.starts_at)))}
                  </span>
                  <Badge variant={TRIAL_LESSON_STATUS_VARIANT[t.status]}>
                    {TRIAL_LESSON_STATUS_LABEL[t.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function preferenceStatusLabel(status: BookingCandidatePreferenceView["status"]) {
  if (status === "confirmed") return "Bevestigd";
  if (status === "selected") return "Gekozen";
  if (status === "superseded") return "Vervangen";
  if (status === "expired") return "Verlopen";
  return "Geannuleerd";
}

const CONFIRMATION_ACTOR_LABEL: Record<BookingConfirmationView["actor_type"], string> = {
  backoffice: "Backoffice",
  instructor: "Instructeur",
  student: "Leerling",
  tenant_admin: "Tenant admin",
  system: "Systeem",
};

function confirmationStatusLabel(status: BookingConfirmationView["status"]) {
  if (status === "accepted") return "akkoord";
  if (status === "declined") return "geweigerd";
  if (status === "expired") return "verlopen";
  if (status === "cancelled") return "geannuleerd";
  return "open";
}

function confirmationVariant(
  status: BookingConfirmationView["status"],
): BadgeProps["variant"] {
  if (status === "accepted") return "success";
  if (status === "declined") return "danger";
  if (status === "expired" || status === "cancelled") return "outline";
  return "warning";
}

function SelectedPreferencesList({
  leadId,
  preferences,
  confirmations,
  instructorNames,
  hasActive,
}: {
  leadId: string;
  preferences: BookingCandidatePreferenceView[];
  confirmations: BookingConfirmationView[];
  instructorNames: Record<string, string>;
  hasActive: boolean;
}) {
  const visible = preferences.filter((p) => p.booking_candidates);
  if (visible.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Gekozen voorkeuren
        </h3>
        <Badge variant="primary">Bevestigingsflow</Badge>
      </div>
      <ul className="space-y-2">
        {visible.map((preference) => {
          const candidate = preference.booking_candidates!;
          const start = new Date(candidate.starts_at);
          const end = new Date(candidate.ends_at);
          const instructorName =
            instructorNames[candidate.instructor_id] ?? "Instructeur";
          const candidateConfirmations = confirmations.filter(
            (c) => c.booking_candidate_id === candidate.id,
          );
          const pendingInstructor = candidateConfirmations.find(
            (c) => c.actor_type === "instructor" && c.status === "pending",
          );
          const instructorAccepted = candidateConfirmations.some(
            (c) => c.actor_type === "instructor" && c.status === "accepted",
          );
          return (
            <li
              key={preference.id}
              className="rounded-md border border-primary/25 bg-primary-soft/40 p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      #{preference.preference_rank} {cap(slotFmt.format(start))} ·{" "}
                      {timeFmt.format(start)}-{timeFmt.format(end)}
                    </span>
                    <Badge variant="outline">
                      {preferenceStatusLabel(preference.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {candidate.duration_min} min · {instructorName}
                    {candidate.pickup_location
                      ? ` · Ophaal: ${candidate.pickup_location}`
                      : ""}
                  </p>
                  {candidate.reason ? (
                    <p className="mt-2 text-xs font-medium text-primary">
                      {candidate.reason}
                    </p>
                  ) : null}
                  {candidateConfirmations.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {candidateConfirmations.map((confirmation) => (
                        <Badge
                          key={confirmation.id}
                          variant={confirmationVariant(confirmation.status)}
                        >
                          {CONFIRMATION_ACTOR_LABEL[confirmation.actor_type]}{" "}
                          {confirmationStatusLabel(confirmation.status)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <RouteInsight
                    route={{
                      status: candidate.route_status ?? "unavailable",
                      travel_to_min: candidate.route_travel_to_min,
                      travel_from_min: candidate.route_travel_from_min,
                      prev_distance_km: null,
                      next_distance_km: null,
                      needs_manual_confirm: candidate.route_needs_confirm,
                    }}
                  />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    score {candidate.score}
                  </span>
                  {!hasActive && candidate.status !== "confirmed" ? (
                    <form action={confirmTrialBookingPreference}>
                      <input type="hidden" name="lead_id" value={leadId} />
                      <input
                        type="hidden"
                        name="booking_preference_id"
                        value={preference.id}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant={pendingInstructor ? "outline" : "primary"}
                        disabled={Boolean(pendingInstructor)}
                      >
                        {pendingInstructor
                          ? "Wacht op instructeur"
                          : instructorAccepted
                            ? "Definitief inplannen"
                            : "Bevestig proefles"}
                      </Button>
                    </form>
                  ) : null}
                  {pendingInstructor ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <form action={respondTrialBookingConfirmation}>
                        <input type="hidden" name="lead_id" value={leadId} />
                        <input
                          type="hidden"
                          name="booking_confirmation_id"
                          value={pendingInstructor.id}
                        />
                        <input type="hidden" name="response" value="accepted" />
                        <Button type="submit" size="sm">
                          Instructeur akkoord
                        </Button>
                      </form>
                      <form action={respondTrialBookingConfirmation}>
                        <input type="hidden" name="lead_id" value={leadId} />
                        <input
                          type="hidden"
                          name="booking_confirmation_id"
                          value={pendingInstructor.id}
                        />
                        <input type="hidden" name="response" value="declined" />
                        <Button type="submit" size="sm" variant="outline">
                          Afwijzen
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActiveTrial({
  leadId,
  trial,
  instructorName,
  mapPoints,
}: {
  leadId: string;
  trial: TrialLesson;
  instructorName: string;
  mapPoints?: MapPoint[];
}) {
  const start = new Date(trial.starts_at);
  const end = new Date(trial.ends_at);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Door leerling gekozen moment
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {cap(slotFmt.format(start))}
            </p>
            <p className="text-sm text-foreground">
              {timeFmt.format(start)} – {timeFmt.format(end)} · {trial.duration_min}{" "}
              min
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Instructeur: {instructorName}
              {trial.pickup_location ? ` · Ophaal: ${trial.pickup_location}` : ""}
            </p>
          </div>
          <Badge variant={TRIAL_LESSON_STATUS_VARIANT[trial.status]}>
            {TRIAL_LESSON_STATUS_LABEL[trial.status]}
          </Badge>
        </div>
        {trial.reason ? (
          <p className="mt-2 text-xs text-primary">Match: {trial.reason}</p>
        ) : null}
        <RouteInsight
          route={{
            status: trial.route_status,
            travel_to_min: trial.route_travel_to_min,
            travel_from_min: trial.route_travel_from_min,
            prev_distance_km: null,
            next_distance_km: null,
            needs_manual_confirm: trial.route_needs_confirm,
          }}
        />
        {mapPoints && mapPoints.length > 0 ? (
          <TrialRouteMap points={mapPoints} />
        ) : null}
      </div>

      {trial.status === "provisional" ? (
        <div className="flex flex-wrap gap-2">
          <form action={confirmTrialLesson}>
            <input type="hidden" name="lead_id" value={leadId} />
            <input type="hidden" name="trial_id" value={trial.id} />
            <Button type="submit" size="sm">
              Bevestigen
            </Button>
          </form>
          <form action={rejectTrialLesson}>
            <input type="hidden" name="lead_id" value={leadId} />
            <input type="hidden" name="trial_id" value={trial.id} />
            <Button type="submit" size="sm" variant="outline">
              Afwijzen
            </Button>
          </form>
        </div>
      ) : (
        <form action={rejectTrialLesson}>
          <input type="hidden" name="lead_id" value={leadId} />
          <input type="hidden" name="trial_id" value={trial.id} />
          <Button type="submit" size="sm" variant="outline">
            Annuleren
          </Button>
        </form>
      )}

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Verzetten / wijzigen
        </summary>
        <form action={rescheduleTrialLesson} className="mt-3 space-y-3">
          <input type="hidden" name="lead_id" value={leadId} />
          <input type="hidden" name="trial_id" value={trial.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="trial_date"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Datum
              </label>
              <input
                id="trial_date"
                type="date"
                name="date"
                required
                defaultValue={toDateInput(trial.starts_at)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="trial_time"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Tijd
              </label>
              <input
                id="trial_time"
                type="time"
                name="time"
                required
                defaultValue={toTimeInput(trial.starts_at)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="trial_duration"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Duur
            </label>
            <Select
              id="trial_duration"
              name="duration_min"
              defaultValue={String(trial.duration_min)}
            >
              {TRIAL_LESSON_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minuten
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" variant="outline">
            Wijziging opslaan
          </Button>
        </form>
      </details>
    </div>
  );
}

function SuggestionsList({
  leadId,
  suggestions,
  instructorNames,
  hasActive,
}: {
  leadId: string;
  suggestions: TrialSuggestion[];
  instructorNames: Record<string, string>;
  hasActive: boolean;
}) {
  if (suggestions.length === 0) {
    if (hasActive) return null;
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen proefles gekozen. Er zijn op dit moment geen voorstelbare momenten
        (controleer de agenda, het voertuigtype of de instructeursinstellingen).
      </p>
    );
  }
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        {hasActive
          ? "Alternatieve momenten op basis van de intake:"
          : "De leerling heeft nog geen moment gekozen. Dit zijn de momenten die we op basis van de intake voorstellen:"}
      </p>
      <ul className="space-y-2">
        {suggestions.map((s) => {
          const start = new Date(s.starts_at);
          const end = new Date(s.ends_at);
          const instructorName =
            instructorNames[s.instructor_id] ?? s.instructor_name ?? "Instructeur";
          return (
            <li
              key={s.starts_at}
              className="rounded-md border border-border bg-muted/30 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {cap(slotFmt.format(start))} · {timeFmt.format(start)}–
                  {timeFmt.format(end)}
                </span>
                <span className="text-xs text-muted-foreground">
                  score {s.score}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {instructorName}
                {s.pickup_location ? ` - ${s.pickup_location}` : ""}
              </p>
              {s.factors.length > 0 ? (
                <p className="mt-1 text-xs text-primary">
                  {s.factors.map((f) => f.label).join(" · ")}
                </p>
              ) : null}
              {s.route ? <RouteInsight route={s.route} /> : null}
              {!hasActive ? (
                <form action={bookTrialAtSlot} className="mt-3">
                  <input type="hidden" name="lead_id" value={leadId} />
                  <input
                    type="hidden"
                    name="instructor_id"
                    value={s.instructor_id}
                  />
                  <input type="hidden" name="starts_at" value={s.starts_at} />
                  <input
                    type="hidden"
                    name="duration_min"
                    value={s.duration_min}
                  />
                  <input
                    type="hidden"
                    name="pickup_location"
                    value={s.pickup_location ?? ""}
                  />
                  <input
                    type="hidden"
                    name="pickup_lat"
                    value={s.pickup_lat ?? ""}
                  />
                  <input
                    type="hidden"
                    name="pickup_lng"
                    value={s.pickup_lng ?? ""}
                  />
                  <input
                    type="hidden"
                    name="pickup_place_id"
                    value={s.pickup_place_id ?? ""}
                  />
                  <input
                    type="hidden"
                    name="pickup_formatted_address"
                    value={s.pickup_formatted_address ?? ""}
                  />
                  <input
                    type="hidden"
                    name="route_status"
                    value={s.route?.status ?? "unavailable"}
                  />
                  <input
                    type="hidden"
                    name="route_travel_to_min"
                    value={s.route?.travel_to_min ?? ""}
                  />
                  <input
                    type="hidden"
                    name="route_travel_from_min"
                    value={s.route?.travel_from_min ?? ""}
                  />
                  <input
                    type="hidden"
                    name="route_needs_confirm"
                    value={s.route?.needs_manual_confirm ? "true" : "false"}
                  />
                  <input type="hidden" name="reason" value={s.reason} />
                  <Button type="submit" size="sm">
                    Voorlopig inplannen
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
