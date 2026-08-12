"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { ChevronDown, LockKeyhole, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  AppointmentTypePolicy,
  AppointmentWizardSettings,
} from "@/domains/planning/domain/appointment-policy";
import {
  saveAppointmentTypePolicy,
  saveAppointmentWizardSettings,
} from "./actions";

type Feedback = { tone: "success" | "error"; message: string };

const CATEGORIES = [
  ["STUDENT", "Met leerling"],
  ["PRIVATE", "Privé"],
  ["OPERATIONAL", "Operationeel"],
] as const;
const STUDENT_REQUIREMENTS = [
  ["REQUIRED", "Verplicht"],
  ["OPTIONAL", "Optioneel"],
  ["FORBIDDEN", "Niet toegestaan"],
] as const;
const LOCATION_REQUIREMENTS = [
  ["NONE", "Geen locatie"],
  ["OPTIONAL", "Locatie optioneel"],
  ["PICKUP", "Ophaalpunt"],
  ["DESTINATION", "Bestemming"],
  ["PICKUP_AND_DESTINATION", "Ophalen en bestemming"],
] as const;
const VEHICLE_REQUIREMENTS = [
  ["NONE", "Geen voertuig"],
  ["AUTO", "Automatisch oplossen"],
  ["REQUIRED", "Voertuig verplicht"],
] as const;
const VISIBILITIES = [
  ["HIDDEN", "Verborgen"],
  ["AFTER_CONFIRMATION", "Na bevestiging"],
  ["PUBLISHED", "Gepubliceerd"],
] as const;
const TONES = [
  ["BLUE", "Blauw"],
  ["VIOLET", "Violet"],
  ["ROSE", "Roze"],
  ["AMBER", "Amber"],
  ["GREEN", "Groen"],
  ["TEAL", "Teal"],
  ["NEUTRAL", "Neutraal"],
  ["SAND", "Zand"],
] as const;
const ICONS = [
  ["car", "Auto"],
  ["graduation", "Proefles"],
  ["flag", "Vlag"],
  ["clipboard", "Klembord"],
  ["coffee", "Koffie"],
  ["user", "Persoon"],
  ["calendar", "Kalender"],
  ["tools", "Gereedschap"],
  ["book", "Boek"],
] as const;

function FeedbackMessage({ feedback }: { feedback?: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        feedback.tone === "success"
          ? "rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
          : "rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200"
      }
    >
      {feedback.message}
    </p>
  );
}

function NumberField({
  name,
  label,
  value,
  min = 0,
  max = 480,
  step = 1,
}: {
  name: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={name}
          type="number"
          min={min}
          max={max}
          step={step}
          defaultValue={value}
          className="tabular-nums"
          required
        />
        <span className="text-xs text-muted-foreground">min</span>
      </div>
    </div>
  );
}

function ToggleField({
  name,
  label,
  description,
  checked,
}: {
  name: string;
  label: string;
  description?: string;
  checked: boolean;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={checked}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function SelectField({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={name} defaultValue={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </Select>
    </div>
  );
}

function PolicyEditor({
  policy,
  pending,
  feedback,
  onSubmit,
}: {
  policy: AppointmentTypePolicy;
  pending: boolean;
  feedback?: Feedback;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-sm font-black text-primary"
          aria-hidden
        >
          {policy.shortLabel.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-black text-foreground">{policy.label}</span>
            <Badge variant={policy.isActive ? "success" : "outline"}>
              {policy.isActive ? "Actief" : "Inactief"}
            </Badge>
            <Badge variant="outline">v{policy.version}</Badge>
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            {policy.defaultDurationMinutes} min · buffer{" "}
            {policy.defaultBufferBeforeMinutes}/
            {policy.defaultBufferAfterMinutes} min ·{" "}
            {policy.studentRequirement === "REQUIRED"
              ? "leerling verplicht"
              : policy.studentRequirement === "OPTIONAL"
                ? "leerling optioneel"
                : "geen leerling"}
          </span>
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>

      <form
        onSubmit={onSubmit}
        className="space-y-5 border-t border-border px-4 py-4"
      >
        <input type="hidden" name="code" value={policy.code} />
        <section
          className="space-y-3"
          aria-labelledby={`${policy.code}-general`}
        >
          <h2
            id={`${policy.code}-general`}
            className="text-sm font-black text-foreground"
          >
            Algemeen
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${policy.code}-label`}>Naam</Label>
              <Input
                id={`${policy.code}-label`}
                name="label"
                defaultValue={policy.label}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${policy.code}-short-label`}>Korte naam</Label>
              <Input
                id={`${policy.code}-short-label`}
                name="short_label"
                defaultValue={policy.shortLabel}
                maxLength={40}
                required
              />
            </div>
            <SelectField
              name="icon_key"
              label="Icoon"
              value={policy.iconKey}
              options={ICONS}
            />
            <SelectField
              name="calendar_tone"
              label="Kalenderkleur"
              value={policy.calendarTone}
              options={TONES}
            />
            <SelectField
              name="category"
              label="Categorie"
              value={policy.category}
              options={CATEGORIES}
            />
            <SelectField
              name="student_requirement"
              label="Leerling"
              value={policy.studentRequirement}
              options={STUDENT_REQUIREMENTS}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`${policy.code}-sort-order`}>Volgorde</Label>
              <Input
                id={`${policy.code}-sort-order`}
                name="sort_order"
                type="number"
                min={0}
                max={1000}
                defaultValue={policy.sortOrder}
                required
              />
            </div>
            <ToggleField
              name="is_active"
              label="Actief"
              description="Alleen actieve typen verschijnen in de wizard."
              checked={policy.isActive}
            />
          </div>
        </section>

        <section className="space-y-3" aria-labelledby={`${policy.code}-time`}>
          <h2
            id={`${policy.code}-time`}
            className="text-sm font-black text-foreground"
          >
            Tijd en buffers
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              name="default_duration_minutes"
              label="Standaardduur"
              value={policy.defaultDurationMinutes}
              min={policy.minDurationMinutes}
              max={policy.maxDurationMinutes}
              step={policy.durationStepMinutes}
            />
            <NumberField
              name="min_duration_minutes"
              label="Minimale duur"
              value={policy.minDurationMinutes}
              min={5}
              step={5}
            />
            <NumberField
              name="max_duration_minutes"
              label="Maximale duur"
              value={policy.maxDurationMinutes}
              min={policy.minDurationMinutes}
              step={policy.durationStepMinutes}
            />
            <NumberField
              name="duration_step_minutes"
              label="Stapgrootte"
              value={policy.durationStepMinutes}
              min={5}
              max={120}
              step={5}
            />
            <NumberField
              name="default_buffer_before_minutes"
              label="Buffer voor"
              value={policy.defaultBufferBeforeMinutes}
              max={240}
              step={10}
            />
            <NumberField
              name="default_buffer_after_minutes"
              label="Buffer na"
              value={policy.defaultBufferAfterMinutes}
              max={240}
              step={10}
            />
            <NumberField
              name="min_buffer_before_minutes"
              label="Minimum voor"
              value={policy.minBufferBeforeMinutes}
              max={240}
              step={10}
            />
            <NumberField
              name="min_buffer_after_minutes"
              label="Minimum na"
              value={policy.minBufferAfterMinutes}
              max={240}
              step={10}
            />
          </div>
        </section>

        <section className="space-y-3" aria-labelledby={`${policy.code}-rules`}>
          <h2
            id={`${policy.code}-rules`}
            className="text-sm font-black text-foreground"
          >
            Locatie, voertuig en planning
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              name="location_requirement"
              label="Locatiebeleid"
              value={policy.locationRequirement}
              options={LOCATION_REQUIREMENTS}
            />
            <SelectField
              name="vehicle_requirement"
              label="Voertuigbeleid"
              value={policy.vehicleRequirement}
              options={VEHICLE_REQUIREMENTS}
            />
            <SelectField
              name="student_visibility"
              label="Zichtbaarheid leerling"
              value={policy.studentVisibility}
              options={VISIBILITIES}
            />
            <ToggleField
              name="route_validation_enabled"
              label="Routecontrole"
              checked={policy.routeValidationEnabled}
            />
            <ToggleField
              name="blocks_instructor_availability"
              label="Blokkeert instructeur"
              checked={policy.blocksInstructorAvailability}
            />
            <ToggleField
              name="blocks_vehicle_availability"
              label="Blokkeert voertuig"
              checked={policy.blocksVehicleAvailability}
            />
          </div>
        </section>

        <section
          className="space-y-3"
          aria-labelledby={`${policy.code}-overrides`}
        >
          <h2
            id={`${policy.code}-overrides`}
            className="flex items-center gap-2 text-sm font-black text-foreground"
          >
            <LockKeyhole className="h-4 w-4 text-primary" aria-hidden />
            Instructeur en communicatie
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleField
              name="instructor_can_override_duration"
              label="Duur aanpassen"
              checked={policy.instructorCanOverrideDuration}
            />
            <ToggleField
              name="instructor_can_override_buffer"
              label="Buffer aanpassen"
              checked={policy.instructorCanOverrideBuffer}
            />
            <ToggleField
              name="instructor_can_override_location"
              label="Locatie aanpassen"
              checked={policy.instructorCanOverrideLocation}
            />
            <ToggleField
              name="instructor_can_override_vehicle"
              label="Voertuig aanpassen"
              checked={policy.instructorCanOverrideVehicle}
            />
            <ToggleField
              name="notify_student_on_create"
              label="Leerling informeren bij aanmaken"
              checked={policy.notifyStudentOnCreate}
            />
            <ToggleField
              name="notify_student_on_change"
              label="Leerling informeren bij wijzigen"
              checked={policy.notifyStudentOnChange}
            />
          </div>
        </section>

        <FeedbackMessage feedback={feedback} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className="min-h-11">
            {pending ? "Opslaan…" : `${policy.label} opslaan`}
          </Button>
        </div>
      </form>
    </details>
  );
}

export function AppointmentTypePolicyManager({
  policies,
  settings,
}: {
  policies: readonly AppointmentTypePolicy[];
  settings: AppointmentWizardSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") ?? "policy");
    setPendingKey(code);
    setFeedback((current) => {
      const next = { ...current };
      delete next[code];
      return next;
    });
    startTransition(async () => {
      const result = await saveAppointmentTypePolicy(formData);
      setFeedback((current) => ({
        ...current,
        [code]: result.ok
          ? { tone: "success", message: "Afspraaktype opgeslagen." }
          : { tone: "error", message: result.error ?? "Opslaan mislukt." },
      }));
      setPendingKey(null);
      if (result.ok) router.refresh();
    });
  }

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPendingKey("wizard");
    setFeedback((current) => {
      const next = { ...current };
      delete next.wizard;
      return next;
    });
    startTransition(async () => {
      const result = await saveAppointmentWizardSettings(formData);
      setFeedback((current) => ({
        ...current,
        wizard: result.ok
          ? { tone: "success", message: "Wizardinstellingen opgeslagen." }
          : { tone: "error", message: result.error ?? "Opslaan mislukt." },
      }));
      setPendingKey(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-5" data-appointment-policy-manager="">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Settings2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-black text-foreground">
              Algemene wizardregels
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Bepaal de server-side leerlingenscope en hoe NXTDRIVE voertuigen
              automatisch oplost. Deze keuzes verruimen nooit de rol- of
              vestigingstoegang van een instructeur.
            </p>
          </div>
        </div>
        <form onSubmit={submitSettings} className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              name="student_scope"
              label="Leerlingselectie voor instructeurs"
              value={settings.studentScope}
              options={[
                ["OWN_ACTIVE", "Alleen eigen actieve leerlingen"],
                [
                  "OWN_AND_REPLACEMENT",
                  "Eigen en toegestane vervangleerlingen",
                ],
                ["BRANCH_ACTIVE", "Actieve leerlingen van eigen vestiging"],
                ["TENANT_ACTIVE", "Alle actieve leerlingen binnen tenant"],
              ]}
            />
            <SelectField
              name="vehicle_selection_mode"
              label="Voertuigselectie"
              value={settings.vehicleSelectionMode}
              options={[
                ["AUTO_DEFAULT", "Automatisch standaardvoertuig"],
                ["AUTO_WITH_OVERRIDE", "Automatisch, met toegestane afwijking"],
                ["ALWAYS_SELECT", "Altijd expliciet selecteren"],
              ]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleField
              name="allow_student_home_as_pickup"
              label="Woonadres als pickupvoorstel"
              checked={settings.allowStudentHomeAsPickup}
            />
            <ToggleField
              name="allow_default_pickup_update"
              label="Standaardpickup laten wijzigen"
              checked={settings.allowDefaultPickupUpdate}
            />
            <ToggleField
              name="vehicle_required"
              label="Voertuig vereist waar van toepassing"
              checked={settings.vehicleRequired}
            />
            <ToggleField
              name="instructor_may_override_vehicle"
              label="Instructeur mag voertuig wijzigen"
              checked={settings.instructorMayOverrideVehicle}
            />
            <ToggleField
              name="validate_vehicle_availability"
              label="Voertuigbeschikbaarheid controleren"
              checked={settings.validateVehicleAvailability}
            />
            <ToggleField
              name="route_override_requires_reason"
              label="Reden verplicht bij route-override"
              checked={settings.routeOverrideRequiresReason}
            />
          </div>
          <FeedbackMessage feedback={feedback.wizard} />
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={pending && pendingKey === "wizard"}
              className="min-h-11"
            >
              {pending && pendingKey === "wizard"
                ? "Opslaan…"
                : "Wizardregels opslaan"}
            </Button>
          </div>
        </form>
      </section>

      <div className="space-y-3">
        {policies.map((policy) => (
          <PolicyEditor
            key={`${policy.code}-${policy.version}`}
            policy={policy}
            pending={pending && pendingKey === policy.code}
            feedback={feedback[policy.code]}
            onSubmit={submitPolicy}
          />
        ))}
      </div>
    </div>
  );
}
