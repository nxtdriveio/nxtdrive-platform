"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import {
  INTAKE_APPLICANT_TYPES,
  INTAKE_APPLICANT_TYPE_LABEL,
  INTAKE_DAYPARTS,
  INTAKE_DAYPART_LABEL,
  INTAKE_LICENSE_GOALS,
  INTAKE_LICENSE_GOAL_LABEL,
  INTAKE_PACES,
  INTAKE_PACE_LABEL,
  INTAKE_STATUSES,
  INTAKE_STATUS_LABEL,
  INTAKE_TRANSMISSIONS,
  INTAKE_TRANSMISSION_LABEL,
  INTAKE_WEEKDAYS,
  INTAKE_WEEKDAY_LABEL,
  LEAD_SOURCES,
  LEAD_SOURCE_LABEL,
  type LeadSource,
} from "@/lib/leads/types";
import { submitIntake } from "./actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{5,}$/;

const STEP_TITLES = [
  "Persoonsgegevens",
  "Rijopleiding",
  "Beschikbaarheid",
  "Leerprofiel",
  "Akkoord",
] as const;

type State = {
  full_name: string;
  email: string;
  phone: string;
  applicant_type: string;
  date_of_birth: string;
  city: string;
  city_lat: string;
  city_lng: string;
  city_place_id: string;
  pickup_location: string;
  pickup_lat: string;
  pickup_lng: string;
  pickup_place_id: string;
  pickup_formatted_address: string;
  source: string;
  license_goal: string;
  transmission: string;
  has_driving_experience: string;
  had_lessons_before: string;
  has_done_exam: string;
  theory_status: string;
  health_declaration_status: string;
  cbr_authorization_status: string;
  preferred_days: string[];
  preferred_times: string[];
  weekly_availability: string;
  desired_start_date: string;
  lessons_per_week: string;
  pace: string;
  has_anxiety: string;
  remarks: string;
  terms_accepted: boolean;
};

export type IntakeTrackingContext = {
  mode?: "standalone" | "iframe" | "script";
  source?: string;
  campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  referrer?: string;
  landing_url?: string;
  embed_host?: string;
};

const INITIAL: State = {
  full_name: "",
  email: "",
  phone: "",
  applicant_type: "student",
  date_of_birth: "",
  city: "",
  city_lat: "",
  city_lng: "",
  city_place_id: "",
  pickup_location: "",
  pickup_lat: "",
  pickup_lng: "",
  pickup_place_id: "",
  pickup_formatted_address: "",
  source: "website",
  license_goal: "",
  transmission: "",
  has_driving_experience: "",
  had_lessons_before: "",
  has_done_exam: "",
  theory_status: "unknown",
  health_declaration_status: "unknown",
  cbr_authorization_status: "unknown",
  preferred_days: [],
  preferred_times: [],
  weekly_availability: "",
  desired_start_date: "",
  lessons_per_week: "",
  pace: "",
  has_anxiety: "",
  remarks: "",
  terms_accepted: false,
};

function validateStep(step: number, s: State): string | null {
  if (step === 0) {
    if (!s.full_name.trim()) return "Vul je naam in.";
    if (!s.email.trim() && !s.phone.trim())
      return "Vul minimaal een e-mailadres of telefoonnummer in.";
    if (s.email.trim() && !EMAIL_RE.test(s.email.trim()))
      return "Vul een geldig e-mailadres in.";
    if (s.phone.trim() && !PHONE_RE.test(s.phone.trim()))
      return "Vul een geldig telefoonnummer in.";
    return null;
  }
  if (step === 1) {
    if (!s.license_goal) return "Kies een rijbewijsdoel.";
    if (!s.transmission) return "Kies schakel of automaat.";
    return null;
  }
  if (step === 2) {
    if (s.lessons_per_week) {
      const n = Number.parseInt(s.lessons_per_week, 10);
      if (!Number.isInteger(n) || n < 1 || n > 14)
        return "Aantal lessen per week moet tussen 1 en 14 liggen.";
    }
    return null;
  }
  if (step === 4) {
    if (!s.terms_accepted)
      return "Je moet akkoord gaan met de voorwaarden en privacyverklaring.";
    return null;
  }
  return null;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Versturen..." : label}
    </Button>
  );
}

export function IntakeWizard({
  slug,
  serverError,
  referralCode,
  embedded = false,
  defaultSource = "website",
  tracking,
}: {
  slug: string;
  serverError?: string;
  referralCode?: string;
  embedded?: boolean;
  defaultSource?: LeadSource;
  tracking?: IntakeTrackingContext;
}) {
  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState<State>(() => ({
    ...INITIAL,
    source: defaultSource,
  }));
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const toggleArray = (
    key: "preferred_days" | "preferred_times",
    value: string,
  ) =>
    setState((prev) => {
      const cur = prev[key];
      return {
        ...prev,
        [key]: cur.includes(value)
          ? cur.filter((v) => v !== value)
          : [...cur, value],
      };
    });

  const next = () => {
    const v = validateStep(step, state);
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  };

  const prev = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  // Guard the native submit: re-run every step's validation client-side.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    for (let i = 0; i < STEP_TITLES.length; i++) {
      const v = validateStep(i, state);
      if (v) {
        e.preventDefault();
        setStep(i);
        setError(v);
        return;
      }
    }
  };

  const isLast = step === STEP_TITLES.length - 1;
  const progress = ((step + 1) / STEP_TITLES.length) * 100;

  return (
    <Card className={embedded ? "p-5 sm:p-6" : "p-6"}>
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>
            Stap {step + 1} van {STEP_TITLES.length} · {STEP_TITLES[step]}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {(error || serverError) && (
        <div className="mb-4 rounded-md border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-3 text-sm text-danger">
          {error ?? serverError}
        </div>
      )}

      <form action={submitIntake} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="tenant_slug" value={slug} />
        {embedded ? (
          <input type="hidden" name="embed_mode" value="widget" />
        ) : null}
        {tracking?.mode ? (
          <input type="hidden" name="tracking_mode" value={tracking.mode} />
        ) : null}
        {Object.entries(tracking ?? {}).map(([key, value]) =>
          key === "mode" || !value ? null : (
            <input
              key={key}
              type="hidden"
              name={`tracking_${key}`}
              value={value}
            />
          ),
        )}

        {/* Hidden mirrors so all fields post regardless of current step.
            Controlled state keeps every step's data alive across navigation.
            Visible inputs are nameless — these mirrors are the single submit
            source, so unmounting a step never drops its data. */}
        <input type="hidden" name="full_name" value={state.full_name} />
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="phone" value={state.phone} />
        <input type="hidden" name="date_of_birth" value={state.date_of_birth} />
        <input type="hidden" name="city" value={state.city} />
        <input type="hidden" name="city_lat" value={state.city_lat} />
        <input type="hidden" name="city_lng" value={state.city_lng} />
        <input type="hidden" name="city_place_id" value={state.city_place_id} />
        <input
          type="hidden"
          name="pickup_location"
          value={state.pickup_location}
        />
        <input type="hidden" name="pickup_lat" value={state.pickup_lat} />
        <input type="hidden" name="pickup_lng" value={state.pickup_lng} />
        <input
          type="hidden"
          name="pickup_place_id"
          value={state.pickup_place_id}
        />
        <input
          type="hidden"
          name="pickup_formatted_address"
          value={state.pickup_formatted_address}
        />
        <input
          type="hidden"
          name="weekly_availability"
          value={state.weekly_availability}
        />
        <input
          type="hidden"
          name="desired_start_date"
          value={state.desired_start_date}
        />
        <input
          type="hidden"
          name="lessons_per_week"
          value={state.lessons_per_week}
        />
        <input type="hidden" name="remarks" value={state.remarks} />
        <input
          type="hidden"
          name="applicant_type"
          value={state.applicant_type}
        />
        <input type="hidden" name="source" value={state.source} />
        {referralCode && (
          <input type="hidden" name="referral_code" value={referralCode} />
        )}
        <input type="hidden" name="license_goal" value={state.license_goal} />
        <input type="hidden" name="transmission" value={state.transmission} />
        <input
          type="hidden"
          name="has_driving_experience"
          value={state.has_driving_experience}
        />
        <input
          type="hidden"
          name="had_lessons_before"
          value={state.had_lessons_before}
        />
        <input type="hidden" name="has_done_exam" value={state.has_done_exam} />
        <input type="hidden" name="theory_status" value={state.theory_status} />
        <input
          type="hidden"
          name="health_declaration_status"
          value={state.health_declaration_status}
        />
        <input
          type="hidden"
          name="cbr_authorization_status"
          value={state.cbr_authorization_status}
        />
        {state.preferred_days.map((d) => (
          <input key={d} type="hidden" name="preferred_days" value={d} />
        ))}
        {state.preferred_times.map((t) => (
          <input key={t} type="hidden" name="preferred_times" value={t} />
        ))}
        <input type="hidden" name="pace" value={state.pace} />
        <input type="hidden" name="has_anxiety" value={state.has_anxiety} />

        {/* Honeypot */}
        <input
          type="text"
          name="website_url"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        {/* STEP 1 — Persoonsgegevens */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Naam</Label>
              <Input
                id="full_name"
                autoComplete="name"
                placeholder="Voor- en achternaam"
                value={state.full_name}
                onChange={(e) => set("full_name", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mailadres</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="jij@email.nl"
                  value={state.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefoon</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="06 12 34 56 78"
                  value={state.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="date_of_birth">Geboortedatum</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={state.date_of_birth}
                  onChange={(e) => set("date_of_birth", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Woonplaats</Label>
                <PlacesAutocomplete
                  id="city"
                  types={["(cities)"]}
                  placeholder="Bijv. Den Haag"
                  value={state.city}
                  onChange={(text) =>
                    setState((prev) => ({
                      ...prev,
                      city: text,
                      city_lat: "",
                      city_lng: "",
                      city_place_id: "",
                    }))
                  }
                  onResolve={(place) =>
                    setState((prev) => ({
                      ...prev,
                      city: place.address,
                      city_lat: place.lat != null ? String(place.lat) : "",
                      city_lng: place.lng != null ? String(place.lng) : "",
                      city_place_id: place.placeId ?? "",
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pickup_location">Wijk / ophaallocatie</Label>
              <PlacesAutocomplete
                id="pickup_location"
                placeholder="Wijk of adres waar we je ophalen"
                value={state.pickup_location}
                onChange={(text) => set("pickup_location", text)}
                onResolve={(place) =>
                  setState((prev) => ({
                    ...prev,
                    pickup_location: place.address,
                    pickup_lat: place.lat != null ? String(place.lat) : "",
                    pickup_lng: place.lng != null ? String(place.lng) : "",
                    pickup_place_id: place.placeId ?? "",
                    pickup_formatted_address: place.formattedAddress ?? "",
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Begin te typen en kies je adres uit de lijst voor een
                nauwkeurige ophaallocatie.
              </p>
            </div>

            <div
              className={
                embedded
                  ? "grid grid-cols-1 gap-4"
                  : "grid grid-cols-1 gap-4 sm:grid-cols-2"
              }
            >
              <div className="space-y-1.5">
                <Label htmlFor="applicant_type_sel">Wie meldt zich aan?</Label>
                <Select
                  id="applicant_type_sel"
                  value={state.applicant_type}
                  onChange={(e) => set("applicant_type", e.target.value)}
                >
                  {INTAKE_APPLICANT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {INTAKE_APPLICANT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </div>
              {!embedded ? (
                <div className="space-y-1.5">
                  <Label htmlFor="source_sel">Hoe heb je ons gevonden?</Label>
                  <Select
                    id="source_sel"
                    value={state.source}
                    onChange={(e) => set("source", e.target.value)}
                  >
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_SOURCE_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              Eén van de velden e-mail of telefoon is verplicht.
            </p>
          </div>
        )}

        {/* STEP 2 — Rijopleiding */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="license_goal_sel">Rijbewijsdoel</Label>
                <Select
                  id="license_goal_sel"
                  value={state.license_goal}
                  onChange={(e) => set("license_goal", e.target.value)}
                >
                  <option value="">Kies…</option>
                  {INTAKE_LICENSE_GOALS.map((g) => (
                    <option key={g} value={g}>
                      {INTAKE_LICENSE_GOAL_LABEL[g]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transmission_sel">Schakel of automaat</Label>
                <Select
                  id="transmission_sel"
                  value={state.transmission}
                  onChange={(e) => set("transmission", e.target.value)}
                >
                  <option value="">Kies…</option>
                  {INTAKE_TRANSMISSIONS.map((t) => (
                    <option key={t} value={t}>
                      {INTAKE_TRANSMISSION_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <YesNoField
                label="Al rijervaring?"
                value={state.has_driving_experience}
                onChange={(v) => set("has_driving_experience", v)}
              />
              <YesNoField
                label="Al eerder rijles gehad?"
                value={state.had_lessons_before}
                onChange={(v) => set("had_lessons_before", v)}
              />
              <YesNoField
                label="Al examen gedaan?"
                value={state.has_done_exam}
                onChange={(v) => set("has_done_exam", v)}
              />
              <StatusField
                label="Theorie al gehaald?"
                value={state.theory_status}
                onChange={(v) => set("theory_status", v)}
              />
              <StatusField
                label="Gezondheidsverklaring geregeld?"
                value={state.health_declaration_status}
                onChange={(v) => set("health_declaration_status", v)}
              />
              <StatusField
                label="CBR-machtiging gedaan?"
                value={state.cbr_authorization_status}
                onChange={(v) => set("cbr_authorization_status", v)}
              />
            </div>
          </div>
        )}

        {/* STEP 3 — Beschikbaarheid */}
        {step === 2 && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                Voorkeursdagen
              </legend>
              <div className="flex flex-wrap gap-2">
                {INTAKE_WEEKDAYS.map((d) => (
                  <Chip
                    key={d}
                    label={INTAKE_WEEKDAY_LABEL[d]}
                    active={state.preferred_days.includes(d)}
                    onClick={() => toggleArray("preferred_days", d)}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                Voorkeurstijden
              </legend>
              <div className="flex flex-wrap gap-2">
                {INTAKE_DAYPARTS.map((t) => (
                  <Chip
                    key={t}
                    label={INTAKE_DAYPART_LABEL[t]}
                    active={state.preferred_times.includes(t)}
                    onClick={() => toggleArray("preferred_times", t)}
                  />
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="weekly_availability">
                Beschikbaarheid per week
              </Label>
              <Textarea
                id="weekly_availability"
                maxLength={500}
                placeholder="Bijv. doordeweeks na 16:00, zaterdagochtend vrij."
                value={state.weekly_availability}
                onChange={(e) => set("weekly_availability", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="desired_start_date">Gewenste startdatum</Label>
                <Input
                  id="desired_start_date"
                  type="date"
                  value={state.desired_start_date}
                  onChange={(e) => set("desired_start_date", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lessons_per_week">Aantal lessen per week</Label>
                <Input
                  id="lessons_per_week"
                  type="number"
                  min={1}
                  max={14}
                  placeholder="Bijv. 2"
                  value={state.lessons_per_week}
                  onChange={(e) => set("lessons_per_week", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4 — Leerprofiel */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pace_sel">Tempo van het traject</Label>
                <Select
                  id="pace_sel"
                  value={state.pace}
                  onChange={(e) => set("pace", e.target.value)}
                >
                  <option value="">Geen voorkeur</option>
                  {INTAKE_PACES.map((p) => (
                    <option key={p} value={p}>
                      {INTAKE_PACE_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </div>
              <YesNoField
                label="Onzekerheid of faalangst?"
                value={state.has_anxiety}
                onChange={(v) => set("has_anxiety", v)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="remarks">Bijzonderheden</Label>
              <Textarea
                id="remarks"
                maxLength={2000}
                placeholder="Iets dat we moeten weten? Bijv. medische zaken, eerdere ervaringen."
                value={state.remarks}
                onChange={(e) => set("remarks", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* STEP 5 — Akkoord + samenvatting */}
        {step === 4 && (
          <div className="space-y-5">
            <Summary state={state} />

            <label className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <input
                type="checkbox"
                name="terms_accepted"
                checked={state.terms_accepted}
                onChange={(e) => set("terms_accepted", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span className="text-foreground">
                Ik ga akkoord met de algemene voorwaarden en de
                privacyverklaring.{" "}
                <span className="text-muted-foreground">(verplicht)</span>
              </span>
            </label>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={prev}>
              Vorige
            </Button>
          ) : (
            <span />
          )}
          {isLast ? (
            <SubmitButton
              label={embedded ? "Vraag proefles aan" : "Aanmelding versturen"}
            />
          ) : (
            <Button type="button" onClick={next}>
              Volgende
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Weet ik niet</option>
        <option value="true">Ja</option>
        <option value="false">Nee</option>
      </Select>
    </div>
  );
}

function StatusField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {INTAKE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {INTAKE_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors"
          : "inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}

function Summary({ state }: { state: State }) {
  const yesNo = (v: string) =>
    v === "true" ? "Ja" : v === "false" ? "Nee" : "Weet ik niet";
  const rows: Array<[string, string]> = [
    ["Naam", state.full_name || "—"],
    ["E-mail", state.email || "—"],
    ["Telefoon", state.phone || "—"],
    ["Woonplaats", state.city || "—"],
    [
      "Rijbewijsdoel",
      state.license_goal
        ? INTAKE_LICENSE_GOAL_LABEL[
            state.license_goal as keyof typeof INTAKE_LICENSE_GOAL_LABEL
          ]
        : "—",
    ],
    [
      "Schakel/automaat",
      state.transmission
        ? INTAKE_TRANSMISSION_LABEL[
            state.transmission as keyof typeof INTAKE_TRANSMISSION_LABEL
          ]
        : "—",
    ],
    [
      "Theorie gehaald",
      INTAKE_STATUS_LABEL[
        state.theory_status as keyof typeof INTAKE_STATUS_LABEL
      ],
    ],
    [
      "Voorkeursdagen",
      state.preferred_days.length
        ? state.preferred_days
            .map(
              (d) =>
                INTAKE_WEEKDAY_LABEL[d as keyof typeof INTAKE_WEEKDAY_LABEL],
            )
            .join(", ")
        : "—",
    ],
    [
      "Voorkeurstijden",
      state.preferred_times.length
        ? state.preferred_times
            .map(
              (t) =>
                INTAKE_DAYPART_LABEL[t as keyof typeof INTAKE_DAYPART_LABEL],
            )
            .join(", ")
        : "—",
    ],
    ["Gewenste startdatum", state.desired_start_date || "—"],
    ["Lessen per week", state.lessons_per_week || "—"],
    [
      "Tempo",
      state.pace
        ? INTAKE_PACE_LABEL[state.pace as keyof typeof INTAKE_PACE_LABEL]
        : "—",
    ],
    ["Faalangst", yesNo(state.has_anxiety)],
  ];

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        Controleer je aanmelding
      </h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-md border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {k}
            </dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
