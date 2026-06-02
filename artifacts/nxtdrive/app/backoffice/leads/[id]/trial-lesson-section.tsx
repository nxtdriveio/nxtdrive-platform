import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  confirmTrialLesson,
  rejectTrialLesson,
  rescheduleTrialLesson,
} from "../actions";
import { TrialRouteMap, type MapPoint } from "@/components/trial-route-map";

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
  activeTrialMapPoints,
}: {
  leadId: string;
  instructorNames: Record<string, string>;
  trials: TrialLesson[];
  suggestions: TrialSuggestion[];
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

        {/* Always show the current suggestions: when nothing is chosen they are
            the options; when a moment is chosen they are alternatives. */}
        <SuggestionsList suggestions={suggestions} hasActive={!!active} />

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
  suggestions,
  hasActive,
}: {
  suggestions: TrialSuggestion[];
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
              {s.factors.length > 0 ? (
                <p className="mt-1 text-xs text-primary">
                  {s.factors.map((f) => f.label).join(" · ")}
                </p>
              ) : null}
              {s.route ? <RouteInsight route={s.route} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
