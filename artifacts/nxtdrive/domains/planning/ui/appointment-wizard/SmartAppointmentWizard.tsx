"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CarFront,
  Check,
  ChevronRight,
  Loader2,
  LockKeyhole,
  MapPin,
  Phone,
  Route,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AddressAutocomplete,
  type AddressDraft,
} from "@/domains/maps/ui/address-autocomplete";
import {
  createSmartAppointment,
  previewSmartAppointment,
  resolveInstructorAppointmentContext,
  searchInstructorStudents,
} from "@/app/instructeur/agenda/wizard/actions";
import { cn } from "@/lib/utils";
import {
  buildWizardSteps,
  durationOptions,
  type AppointmentTypePolicy,
  type WizardStep,
} from "../../domain/appointment-policy";
import type {
  AppointmentAddressDraft,
  AppointmentLocationOption,
  InstructorAgendaWizardBootstrap,
  InstructorStudentSearchResult,
  ResolvedAppointmentContext,
  SmartAppointmentCreateResult,
  SmartAppointmentDraft,
  WizardActionResult,
} from "../../application/smart-appointment-contracts";
import { StudentSearchCombobox } from "./StudentSearchCombobox";

type ResolveInput = Readonly<{
  type: SmartAppointmentDraft["type"];
  studentId?: string | null;
  selectedDate: string;
  selectedTime: string;
}>;

export type SmartAppointmentWizardActions = Readonly<{
  search: typeof searchInstructorStudents;
  resolve: typeof resolveInstructorAppointmentContext;
  preview: typeof previewSmartAppointment;
  create: typeof createSmartAppointment;
}>;

const DEFAULT_ACTIONS: SmartAppointmentWizardActions = {
  search: searchInstructorStudents,
  resolve: resolveInstructorAppointmentContext,
  preview: previewSmartAppointment,
  create: createSmartAppointment,
};

const STEP_LABELS: Record<WizardStep, string> = {
  TYPE: "Type",
  STUDENT: "Leerling",
  PICKUP: "Ophalen",
  PRIVATE_DETAILS: "Gegevens",
  DESTINATION: "Bestemming",
  SCHEDULE: "Tijd",
  VEHICLE: "Voertuig",
  SUMMARY: "Bevestigen",
};

function analytics(
  name: string,
  detail: Record<string, string | number | boolean> = {},
) {
  window.dispatchEvent(
    new CustomEvent("nxtdrive:analytics", { detail: { name, ...detail } }),
  );
  void fetch("/api/instructeur/appointment-wizard/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event: name,
      appointmentType: detail.appointment_type,
      step: detail.step,
      durationMs: detail.duration_ms,
      taps: detail.taps,
      vehicleAutoResolved: detail.vehicle_auto_resolved,
      defaultPickup: detail.default_pickup,
      blocking: detail.blocking,
      success: detail.success,
    }),
  }).catch(() => undefined);
}

function toAddressDraft(value: AddressDraft): AppointmentAddressDraft {
  return {
    formattedAddress: value.formattedAddress,
    label: "Tijdelijk ophaalpunt",
    street: value.street ?? null,
    houseNumber: value.houseNumber ?? null,
    houseNumberAddition: value.houseNumberAddition ?? null,
    postalCode: value.postalCode ?? null,
    city: value.city ?? null,
    region: value.region ?? null,
    countryCode: value.countryCode ?? "NL",
    latitude: value.coordinates?.latitude ?? null,
    longitude: value.coordinates?.longitude ?? null,
    provider: value.provider === "GOOGLE" ? "GOOGLE" : null,
    providerPlaceId: value.providerPlaceId ?? null,
    source:
      value.source === "GOOGLE_PLACES" || value.source === "USER_CONFIRMED"
        ? value.source
        : "USER_ENTERED",
    validationStatus: value.validationStatus,
    changeReason: value.changeReason ?? null,
  };
}

function fromAppointmentAddressDraft(
  value: AppointmentAddressDraft | null,
): AddressDraft | null {
  if (!value) return null;
  return {
    formattedAddress: value.formattedAddress,
    street: value.street ?? null,
    houseNumber: value.houseNumber ?? null,
    houseNumberAddition: value.houseNumberAddition ?? null,
    postalCode: value.postalCode ?? null,
    city: value.city ?? null,
    region: value.region ?? null,
    countryCode: value.countryCode ?? "NL",
    coordinates:
      value.latitude != null && value.longitude != null
        ? { latitude: value.latitude, longitude: value.longitude }
        : null,
    provider: value.provider === "GOOGLE" ? "GOOGLE" : null,
    providerPlaceId: value.providerPlaceId ?? null,
    source:
      value.source === "GOOGLE_PLACES" || value.source === "USER_CONFIRMED"
        ? value.source
        : "USER_ENTERED",
    validationStatus:
      value.validationStatus as AddressDraft["validationStatus"],
    changeReason: value.changeReason ?? null,
  };
}

function endTime(start: string, duration: number): string {
  const [hour, minute] = start.split(":").map(Number);
  const total = hour * 60 + minute + duration;
  return `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function dateLabel(ymd: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

function onlyRouteBlockers(
  context: ResolvedAppointmentContext | null,
): boolean {
  const blockers = context?.planning.blockingReasons ?? [];
  return (
    blockers.length > 0 &&
    blockers.every((reason) =>
      [
        "INSUFFICIENT_TRAVEL_TIME_BEFORE",
        "INSUFFICIENT_TRAVEL_TIME_AFTER",
      ].includes(reason.code),
    )
  );
}

export function SmartAppointmentWizard({
  open,
  onOpenChange,
  selectedDate,
  selectedTime,
  bootstrap,
  offline,
  actions = DEFAULT_ACTIONS,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  selectedTime: string;
  bootstrap: InstructorAgendaWizardBootstrap;
  offline: boolean;
  actions?: SmartAppointmentWizardActions;
  onCreated?: (result: SmartAppointmentCreateResult) => void;
}) {
  const router = useRouter();
  const headingRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const tapCountRef = useRef(0);
  const policies = useMemo(
    () => bootstrap.policies.filter((policy) => policy.isActive),
    [bootstrap.policies],
  );
  const initialPolicy =
    policies.find((policy) => policy.code === "lesson") ?? policies[0]!;
  const [type, setType] = useState(initialPolicy.code);
  const [currentStep, setCurrentStep] = useState<WizardStep>("TYPE");
  const [student, setStudent] = useState<InstructorStudentSearchResult | null>(
    null,
  );
  const [context, setContext] = useState<ResolvedAppointmentContext | null>(
    null,
  );
  const [date, setDate] = useState(selectedDate);
  const [time, setTime] = useState(selectedTime);
  const [duration, setDuration] = useState(
    initialPolicy.defaultDurationMinutes,
  );
  const [bufferBefore, setBufferBefore] = useState(
    initialPolicy.defaultBufferBeforeMinutes,
  );
  const [bufferAfter, setBufferAfter] = useState(
    initialPolicy.defaultBufferAfterMinutes,
  );
  const [pickup, setPickup] = useState<AppointmentLocationOption | null>(null);
  const [temporaryPickup, setTemporaryPickup] =
    useState<AppointmentAddressDraft | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [temporaryDestination, setTemporaryDestination] =
    useState<AppointmentAddressDraft | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const policy =
    policies.find((candidate) => candidate.code === type) ?? initialPolicy;
  const steps = useMemo(
    () => buildWizardSteps({ policy, vehicleResolution: context?.vehicle }),
    [context?.vehicle, policy],
  );
  const stepIndex = Math.max(0, steps.indexOf(currentStep));

  useEffect(() => {
    if (!open) return;
    setType(initialPolicy.code);
    setCurrentStep("TYPE");
    setStudent(null);
    setContext(null);
    setDate(selectedDate);
    setTime(selectedTime);
    setDuration(initialPolicy.defaultDurationMinutes);
    setBufferBefore(initialPolicy.defaultBufferBeforeMinutes);
    setBufferAfter(initialPolicy.defaultBufferAfterMinutes);
    setPickup(null);
    setTemporaryPickup(null);
    setDestinationId("");
    setTemporaryDestination(null);
    setVehicleId(null);
    setTitle("");
    setNotes("");
    setOverrideReason("");
    setError(null);
    setBusyLabel(null);
    openedAtRef.current = performance.now();
    tapCountRef.current = 0;
    analytics("appointment_wizard_opened", { source: "day_calendar" });
  }, [initialPolicy, open, selectedDate, selectedTime]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  const applyContext = useCallback((next: ResolvedAppointmentContext) => {
    setContext(next);
    setDuration(next.duration.suggestedMinutes);
    setBufferBefore(next.buffer.beforeMinutes);
    setBufferAfter(next.buffer.afterMinutes);
    setPickup(next.pickup.defaultLocation ?? null);
    setDestinationId(next.destinations[0]?.id ?? "");
    setVehicleId(next.vehicle.vehicle?.id ?? null);
    if (next.vehicle.status === "RESOLVED") {
      analytics("vehicle_auto_resolved", {
        source: next.vehicle.source,
      });
    } else if (next.vehicle.status === "SELECTION_REQUIRED") {
      analytics("vehicle_selection_required");
    }
    if (
      next.planning.blockingReasons.length > 0 ||
      next.planning.warnings.length > 0
    ) {
      analytics("planning_warning_shown", {
        blocking: next.planning.blockingReasons.length > 0,
      });
    }
  }, []);

  const resolveContext = useCallback(
    async (input: ResolveInput) => {
      setError(null);
      setBusyLabel("Planningcontext ophalen...");
      const result = await actions.resolve(input);
      setBusyLabel(null);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      applyContext(result.data);
      return result.data;
    },
    [actions, applyContext],
  );

  function changeType(nextType: SmartAppointmentDraft["type"]) {
    const nextPolicy = policies.find(
      (candidate) => candidate.code === nextType,
    );
    if (!nextPolicy) return;
    setType(nextType);
    setStudent(null);
    setContext(null);
    setPickup(null);
    setTemporaryPickup(null);
    setTemporaryDestination(null);
    setDestinationId("");
    setVehicleId(null);
    setTitle("");
    setDuration(nextPolicy.defaultDurationMinutes);
    setBufferBefore(nextPolicy.defaultBufferBeforeMinutes);
    setBufferAfter(nextPolicy.defaultBufferAfterMinutes);
    setError(null);
    analytics("appointment_type_selected", { appointment_type: nextType });
  }

  async function selectStudent(next: InstructorStudentSearchResult | null) {
    setStudent(next);
    setContext(null);
    setPickup(null);
    if (!next) return;
    analytics("student_selected", { appointment_type: type });
    await resolveContext({
      type,
      studentId: next.id,
      selectedDate: date,
      selectedTime: time,
    });
  }

  function currentDraft(): SmartAppointmentDraft {
    const destination =
      context?.destinations.find(
        (candidate) => candidate.id === destinationId,
      ) ?? null;
    return {
      type,
      studentId: student?.id ?? null,
      selectedDate: date,
      selectedTime: time,
      durationMinutes: duration,
      bufferBeforeMinutes: bufferBefore,
      bufferAfterMinutes: bufferAfter,
      title: title.trim() || null,
      notes: notes.trim() || null,
      pickup,
      temporaryPickup,
      destination,
      temporaryDestination,
      vehicleId,
      overrideReason: overrideReason.trim() || null,
    };
  }

  async function next() {
    tapCountRef.current += 1;
    setError(null);
    let resolvedForNavigation = context;
    if (currentStep === "TYPE") {
      if (policy.studentRequirement === "FORBIDDEN") {
        const resolved = await resolveContext({
          type,
          selectedDate: date,
          selectedTime: time,
        });
        if (!resolved) return;
        resolvedForNavigation = resolved;
      }
    }
    if (currentStep === "STUDENT") {
      if (policy.studentRequirement === "REQUIRED" && !student) {
        setError("Kies eerst een leerling.");
        return;
      }
      if (student && !context) {
        const resolved = await resolveContext({
          type,
          studentId: student.id,
          selectedDate: date,
          selectedTime: time,
        });
        if (!resolved) return;
        resolvedForNavigation = resolved;
      }
    }
    if (currentStep === "PICKUP" && !pickup && !temporaryPickup) {
      setError("Kies een ophaalpunt of voer een tijdelijk adres in.");
      return;
    }
    if (currentStep === "PRIVATE_DETAILS" && !title.trim()) {
      setError("Vul een titel in.");
      return;
    }
    if (
      currentStep === "DESTINATION" &&
      !destinationId &&
      !temporaryDestination
    ) {
      setError("Kies een bestemming.");
      return;
    }
    if (currentStep === "VEHICLE" && !vehicleId) {
      setError("Kies een beschikbaar voertuig.");
      return;
    }
    if (currentStep === "SCHEDULE") {
      setBusyLabel("Planning controleren...");
      const result = await actions.preview(currentDraft());
      setBusyLabel(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setContext(result.data);
      resolvedForNavigation = result.data;
      setVehicleId((current) => {
        if (result.data.vehicle.status === "RESOLVED") {
          return result.data.vehicle.vehicle?.id ?? null;
        }
        return result.data.vehicle.candidates.some(
          (candidate) => candidate.id === current,
        )
          ? current
          : null;
      });
    }
    const latestSteps = buildWizardSteps({
      policy,
      vehicleResolution: resolvedForNavigation?.vehicle,
    });
    const index = latestSteps.indexOf(currentStep);
    setCurrentStep(latestSteps[Math.min(index + 1, latestSteps.length - 1)]!);
  }

  function back() {
    tapCountRef.current += 1;
    const index = steps.indexOf(currentStep);
    if (index <= 0) return;
    setError(null);
    setCurrentStep(steps[index - 1]!);
  }

  function confirm() {
    tapCountRef.current += 1;
    setError(null);
    if (
      onlyRouteBlockers(context) &&
      bootstrap.settings.routeOverrideRequiresReason
    ) {
      if (overrideReason.trim().length < 3) {
        setError("Geef kort aan waarom je deze planning toch wilt opslaan.");
        return;
      }
    } else if (context && !context.planning.allowed) {
      setError("Pas de planning aan voordat je de afspraak toevoegt.");
      return;
    }
    setBusyLabel("Afspraak toevoegen...");
    startTransition(async () => {
      const result = await actions.create(currentDraft());
      setBusyLabel(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      analytics("appointment_wizard_completed", {
        appointment_type: type,
        vehicle_auto_resolved: context?.vehicle.status === "RESOLVED",
        default_pickup: pickup?.isDefault === true,
        duration_ms: Math.round(performance.now() - openedAtRef.current),
        taps: tapCountRef.current,
        success: true,
      });
      onCreated?.(result.data);
      onOpenChange(false);
      router.refresh();
    });
  }

  function close() {
    analytics("appointment_wizard_cancelled", {
      step: currentStep,
      appointment_type: type,
      duration_ms: Math.round(performance.now() - openedAtRef.current),
      taps: tapCountRef.current,
    });
    onOpenChange(false);
  }

  const canContinue = !pending && !busyLabel;
  const showProgress = steps.length > 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}
    >
      <DialogContent
        className="!absolute inset-x-2 bottom-2 mx-0 flex !h-[min(92dvh,54rem)] !w-auto max-w-none flex-col overflow-hidden rounded-[1.5rem] border p-0 sm:inset-x-4 md:!relative md:inset-auto md:mx-4 md:!h-[min(86dvh,54rem)] md:!w-full md:max-w-[36rem]"
        data-smart-appointment-wizard=""
      >
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-6 pr-14 sm:px-6">
          <div ref={headingRef} tabIndex={-1} className="outline-none">
            <DialogTitle className="font-black">Nieuwe afspraak</DialogTitle>
          </div>
          <DialogDescription>
            {dateLabel(date)} · {time} · {bootstrap.instructorLabel}
          </DialogDescription>
          {showProgress ? (
            <div
              className="pt-3"
              aria-label={`Stap ${stepIndex + 1} van ${steps.length}`}
            >
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                <span>
                  Stap {stepIndex + 1} van {steps.length}
                </span>
                <span>{STEP_LABELS[currentStep]}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                  style={{
                    width: `${((stepIndex + 1) / steps.length) * 100}%`,
                  }}
                />
              </div>
              <ol className="sr-only">
                {steps.map((step, index) => (
                  <li
                    key={step}
                    aria-current={step === currentStep ? "step" : undefined}
                  >
                    {index + 1}. {STEP_LABELS[step]}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {offline ? (
            <div
              className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
              role="status"
            >
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
              Je bent offline. Afspraken kunnen worden toegevoegd zodra je weer
              online bent.
            </div>
          ) : (
            <div
              data-wizard-step={currentStep}
              aria-describedby={
                error ? "smart-appointment-wizard-error" : undefined
              }
            >
              <StepHeading step={currentStep} policy={policy} />
              {currentStep === "TYPE" ? (
                <TypeStep
                  policies={policies}
                  value={type}
                  onChange={changeType}
                />
              ) : null}
              {currentStep === "STUDENT" ? (
                <div className="space-y-4">
                  <StudentSearchCombobox
                    value={student}
                    onChange={(value) => void selectStudent(value)}
                    searchAction={actions.search}
                  />
                  {context?.student ? <StudentCard context={context} /> : null}
                </div>
              ) : null}
              {currentStep === "PICKUP" ? (
                <PickupStep
                  context={context}
                  value={pickup}
                  temporary={temporaryPickup}
                  onChange={(value) => {
                    setPickup(value);
                    setTemporaryPickup(null);
                    analytics("pickup_changed", { source: value.role });
                  }}
                  onTemporaryChange={(value) => {
                    setPickup(null);
                    setTemporaryPickup(toAddressDraft(value));
                    analytics("pickup_changed", { source: "TEMPORARY" });
                  }}
                />
              ) : null}
              {currentStep === "PRIVATE_DETAILS" ? (
                <PrivateDetailsStep
                  title={title}
                  notes={notes}
                  onTitleChange={setTitle}
                  onNotesChange={setNotes}
                />
              ) : null}
              {currentStep === "DESTINATION" ? (
                <DestinationStep
                  context={context}
                  value={destinationId}
                  temporary={temporaryDestination}
                  onChange={setDestinationId}
                  onTemporaryChange={(value) => {
                    setDestinationId("");
                    setTemporaryDestination(toAddressDraft(value));
                  }}
                />
              ) : null}
              {currentStep === "SCHEDULE" ? (
                <ScheduleStep
                  policy={policy}
                  date={date}
                  time={time}
                  duration={duration}
                  bufferBefore={bufferBefore}
                  bufferAfter={bufferAfter}
                  context={context}
                  onDateChange={setDate}
                  onTimeChange={setTime}
                  onDurationChange={(value) => {
                    setDuration(value);
                    analytics("duration_changed", { minutes: value });
                  }}
                  onBufferBeforeChange={setBufferBefore}
                  onBufferAfterChange={(value) => {
                    setBufferAfter(value);
                    analytics("buffer_changed", { minutes: value });
                  }}
                />
              ) : null}
              {currentStep === "VEHICLE" ? (
                <VehicleStep
                  context={context}
                  value={vehicleId}
                  onChange={setVehicleId}
                />
              ) : null}
              {currentStep === "SUMMARY" ? (
                <SummaryStep
                  policy={policy}
                  draft={currentDraft()}
                  student={student}
                  context={context}
                  overrideReason={overrideReason}
                  onOverrideReasonChange={setOverrideReason}
                />
              ) : null}
            </div>
          )}

          {busyLabel ? (
            <div
              className="mt-5 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-semibold"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              {busyLabel}
            </div>
          ) : null}
          {error ? (
            <div
              id="smart-appointment-wizard-error"
              className="mt-5 flex gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            {currentStep === "TYPE" ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={close}
              >
                Annuleren
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={back}
                disabled={!canContinue}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Terug
              </Button>
            )}
            {currentStep === "SUMMARY" ? (
              <Button
                type="button"
                className="min-h-11"
                onClick={confirm}
                disabled={!canContinue || offline}
              >
                {pending ? "Toevoegen..." : `${policy.shortLabel} toevoegen`}
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11"
                onClick={() => void next()}
                disabled={!canContinue || offline}
              >
                Verder
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepHeading({
  step,
  policy,
}: {
  step: WizardStep;
  policy: AppointmentTypePolicy;
}) {
  const descriptions: Record<WizardStep, string> = {
    TYPE: "Kies wat je aan de agenda wilt toevoegen.",
    STUDENT: "Zoek alleen binnen jouw toegestane actieve leerlingen.",
    PICKUP: "Controleer het voorgestelde ophaalpunt.",
    PRIVATE_DETAILS: "Voeg alleen de gegevens toe die je later nodig hebt.",
    DESTINATION: "Kies de examen- of toetsbestemming.",
    SCHEDULE: "Controleer duur, buffers en de voorlopige planning.",
    VEHICLE: "Automatisch plannen lukte niet; kies een geldig voertuig.",
    SUMMARY: `Controleer de ${policy.label.toLowerCase()} en bevestig.`,
  };
  return (
    <div className="mb-5">
      <h3 className="text-lg font-black text-foreground">
        {STEP_LABELS[step]}
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {descriptions[step]}
      </p>
    </div>
  );
}

function TypeStep({
  policies,
  value,
  onChange,
}: {
  policies: readonly AppointmentTypePolicy[];
  value: SmartAppointmentDraft["type"];
  onChange: (value: SmartAppointmentDraft["type"]) => void;
}) {
  const student = policies.filter((policy) => policy.category === "STUDENT");
  const other = policies.filter((policy) => policy.category !== "STUDENT");
  return (
    <div className="space-y-2">
      <Label htmlFor="wizard-appointment-type">Afspraaktype</Label>
      <Select
        id="wizard-appointment-type"
        value={value}
        onChange={(event) =>
          onChange(event.target.value as SmartAppointmentDraft["type"])
        }
        className="h-11"
        data-wizard-type-select=""
      >
        <optgroup label="Met leerling">
          {student.map((policy) => (
            <option key={policy.code} value={policy.code}>
              {policy.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Zonder leerling">
          {other.map((policy) => (
            <option key={policy.code} value={policy.code}>
              {policy.label}
            </option>
          ))}
        </optgroup>
      </Select>
      <p className="text-xs text-muted-foreground">
        Alleen afspraaktypen die jouw rijschool heeft geactiveerd worden
        getoond.
      </p>
    </div>
  );
}

function StudentCard({ context }: { context: ResolvedAppointmentContext }) {
  const student = context.student;
  if (!student) return null;
  return (
    <div
      className="space-y-3 rounded-2xl border bg-muted/25 p-4"
      data-student-context-card=""
    >
      <div className="flex items-center gap-2 font-black">
        <UserRound className="h-4 w-4" aria-hidden />
        {student.displayName}
      </div>
      {student.phone ? (
        <a
          href={`tel:${student.phone.replace(/\s/g, "")}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {student.phone}
          <span className="sr-only"> bellen</span>
        </a>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Voorgestelde duur:{" "}
        <strong className="text-foreground">
          {context.duration.suggestedMinutes} minuten
        </strong>
      </p>
    </div>
  );
}

function PickupStep({
  context,
  value,
  temporary,
  onChange,
  onTemporaryChange,
}: {
  context: ResolvedAppointmentContext | null;
  value: AppointmentLocationOption | null;
  temporary: AppointmentAddressDraft | null;
  onChange: (value: AppointmentLocationOption) => void;
  onTemporaryChange: (value: AddressDraft) => void;
}) {
  const locations = [
    context?.pickup.defaultLocation,
    ...(context?.pickup.alternatives ?? []),
  ].filter((item): item is AppointmentLocationOption => Boolean(item));
  const [manual, setManual] = useState(Boolean(temporary));
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-black">Ophaalpunt</legend>
        {locations.length ? (
          locations.map((location) => (
            <label
              key={location.key}
              className={cn(
                "flex min-h-14 cursor-pointer gap-3 rounded-2xl border p-3",
                value?.key === location.key && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="pickup"
                checked={value?.key === location.key}
                onChange={() => {
                  setManual(false);
                  onChange(location);
                }}
                className="mt-1 h-4 w-4"
              />
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                <span className="block text-sm font-black">
                  {location.label}
                  {location.isDefault ? " · standaard" : ""}
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {location.formattedAddress}
                </span>
              </span>
            </label>
          ))
        ) : (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            Geen opgeslagen ophaalpunt gevonden.
          </p>
        )}
        <label
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3",
            manual && "border-primary bg-primary/5",
          )}
        >
          <input
            type="radio"
            name="pickup"
            checked={manual}
            onChange={() => setManual(true)}
            className="h-4 w-4"
          />
          <span className="text-sm font-bold">
            Ander ophaalpunt voor deze afspraak
          </span>
        </label>
      </fieldset>
      {manual ? (
        <AddressAutocomplete
          value={fromAppointmentAddressDraft(temporary)}
          label="Tijdelijk ophaaladres"
          surface="INSTRUCTOR_APPOINTMENT_WIZARD"
          onChange={onTemporaryChange}
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        Een tijdelijk adres wijzigt het leerlingprofiel niet.
      </p>
    </div>
  );
}

function PrivateDetailsStep({
  title,
  notes,
  onTitleChange,
  onNotesChange,
}: {
  title: string;
  notes: string;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="wizard-title">Titel</Label>
        <Input
          id="wizard-title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          maxLength={200}
          placeholder="Bijvoorbeeld tandarts"
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wizard-notes">Notitie (optioneel)</Label>
        <Textarea
          id="wizard-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={4}
          maxLength={1000}
        />
      </div>
    </div>
  );
}

function DestinationStep({
  context,
  value,
  temporary,
  onChange,
  onTemporaryChange,
}: {
  context: ResolvedAppointmentContext | null;
  value: string;
  temporary: AppointmentAddressDraft | null;
  onChange: (value: string) => void;
  onTemporaryChange: (value: AddressDraft) => void;
}) {
  const [manual, setManual] = useState(Boolean(temporary));
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="wizard-destination">CBR-/toetslocatie</Label>
        <Select
          id="wizard-destination"
          value={value}
          onChange={(event) => {
            setManual(false);
            onChange(event.target.value);
          }}
          className="h-11"
        >
          <option value="">Kies een bestemming</option>
          {(context?.destinations ?? []).map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.label} · {destination.formattedAddress}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => setManual((current) => !current)}
      >
        Andere bestemming
      </Button>
      {manual ? (
        <AddressAutocomplete
          value={fromAppointmentAddressDraft(temporary)}
          label="Tijdelijke bestemming"
          surface="INSTRUCTOR_APPOINTMENT_WIZARD"
          onChange={onTemporaryChange}
        />
      ) : null}
    </div>
  );
}

function ScheduleStep({
  policy,
  date,
  time,
  duration,
  bufferBefore,
  bufferAfter,
  context,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onBufferBeforeChange,
  onBufferAfterChange,
}: {
  policy: AppointmentTypePolicy;
  date: string;
  time: string;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  context: ResolvedAppointmentContext | null;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onBufferBeforeChange: (value: number) => void;
  onBufferAfterChange: (value: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-date">Datum</Label>
          <Input
            id="wizard-date"
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-time">Start</Label>
          <Input
            id="wizard-time"
            type="time"
            step={900}
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-duration">Duur</Label>
          <Select
            id="wizard-duration"
            value={String(duration)}
            onChange={(event) => onDurationChange(Number(event.target.value))}
            disabled={context?.duration.locked}
            className="h-11"
          >
            {durationOptions(policy).map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minuten
              </option>
            ))}
          </Select>
          {context?.duration.locked ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockKeyhole className="h-3 w-3" aria-hidden />
              Ingesteld door rijschool
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Einde</Label>
          <div className="flex h-11 items-center rounded-md border bg-muted/35 px-3 text-sm font-black tabular-nums">
            {endTime(time, duration)}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border p-4">
        <p className="mb-3 text-sm font-black">Planningbuffer</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <BufferField
            id="wizard-buffer-before"
            label="Voor afspraak"
            value={bufferBefore}
            min={policy.minBufferBeforeMinutes}
            locked={context?.buffer.locked}
            onChange={onBufferBeforeChange}
          />
          <BufferField
            id="wizard-buffer-after"
            label="Na afspraak"
            value={bufferAfter}
            min={policy.minBufferAfterMinutes}
            locked={context?.buffer.locked}
            onChange={onBufferAfterChange}
          />
        </div>
      </div>
      {context ? <PlanningStatus context={context} /> : null}
    </div>
  );
}

function BufferField({
  id,
  label,
  value,
  min,
  locked,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  locked?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        value={String(value)}
        disabled={locked}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11"
      >
        {[0, 5, 10, 15, 20, 30, 45, 60]
          .filter((minutes) => minutes >= min)
          .map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} min
            </option>
          ))}
      </Select>
      {locked || min > 0 ? (
        <p className="text-xs text-muted-foreground">
          {locked ? "🔒 Ingesteld door rijschool" : `Minimaal ${min} min`}
        </p>
      ) : null}
    </div>
  );
}

function VehicleStep({
  context,
  value,
  onChange,
}: {
  context: ResolvedAppointmentContext | null;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-black">Voertuig nodig</p>
        <p className="mt-1">{context?.vehicle.reason}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wizard-vehicle">Beschikbaar voertuig</Label>
        <Select
          id="wizard-vehicle"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-11"
        >
          <option value="">Kies een voertuig</option>
          {(context?.vehicle.candidates ?? []).map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.label}
              {vehicle.transmission ? ` · ${vehicle.transmission}` : ""}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function PlanningStatus({ context }: { context: ResolvedAppointmentContext }) {
  const warnings = [
    ...context.planning.blockingReasons,
    ...context.planning.warnings,
  ];
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        context.planning.allowed
          ? warnings.length
            ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
            : "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30",
      )}
      data-planning-status={
        context.planning.allowed
          ? warnings.length
            ? "warning"
            : "allowed"
          : "blocked"
      }
    >
      <div className="flex items-center gap-2 font-black">
        {context.planning.allowed ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <AlertTriangle className="h-4 w-4" aria-hidden />
        )}
        {context.planning.allowed
          ? warnings.length
            ? "Planning met aandachtspunt"
            : "Planning haalbaar"
          : "Planningwaarschuwing"}
      </div>
      {warnings.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {warnings.map((reason, index) => (
            <li key={`${reason.code}-${index}`}>{reason.message}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm">
          Instructeur, leerling en voertuig zijn beschikbaar.
        </p>
      )}
    </div>
  );
}

function SummaryStep({
  policy,
  draft,
  student,
  context,
  overrideReason,
  onOverrideReasonChange,
}: {
  policy: AppointmentTypePolicy;
  draft: SmartAppointmentDraft;
  student: InstructorStudentSearchResult | null;
  context: ResolvedAppointmentContext | null;
  overrideReason: string;
  onOverrideReasonChange: (value: string) => void;
}) {
  const vehicle =
    context?.vehicle.candidates.find(
      (candidate) => candidate.id === draft.vehicleId,
    ) ?? context?.vehicle.vehicle;
  return (
    <div className="space-y-4" data-wizard-summary="">
      <div className="rounded-2xl bg-primary/5 p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
          {dateLabel(draft.selectedDate)}
        </p>
        <p className="mt-2 text-2xl font-black tabular-nums">
          {draft.selectedTime} –{" "}
          {endTime(draft.selectedTime, draft.durationMinutes)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {draft.bufferBeforeMinutes
            ? `${draft.bufferBeforeMinutes} min ervoor · `
            : ""}
          {draft.bufferAfterMinutes
            ? `${draft.bufferAfterMinutes} min erna`
            : "Geen extra buffer"}
        </p>
      </div>
      <SummaryRow
        icon={<CalendarClock className="h-4 w-4" aria-hidden />}
        label="Afspraak"
        value={policy.label}
      />
      {student ? (
        <SummaryRow
          icon={<UserRound className="h-4 w-4" aria-hidden />}
          label="Leerling"
          value={student.displayName}
        />
      ) : null}
      {draft.pickup || draft.temporaryPickup ? (
        <SummaryRow
          icon={<MapPin className="h-4 w-4" aria-hidden />}
          label="Ophaalpunt"
          value={
            draft.pickup?.formattedAddress ??
            draft.temporaryPickup?.formattedAddress ??
            ""
          }
        />
      ) : null}
      {vehicle ? (
        <SummaryRow
          icon={<CarFront className="h-4 w-4" aria-hidden />}
          label="Voertuig"
          value={`${vehicle.label}${context?.vehicle.status === "RESOLVED" ? " · automatisch toegewezen" : ""}`}
        />
      ) : null}
      {context ? <PlanningStatus context={context} /> : null}
      {onlyRouteBlockers(context) ? (
        <div className="space-y-1.5">
          <Label htmlFor="wizard-override-reason">
            Reden om toch te plannen
          </Label>
          <Textarea
            id="wizard-override-reason"
            value={overrideReason}
            onChange={(event) => onOverrideReasonChange(event.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Waarom is deze planning in de praktijk haalbaar?"
          />
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border p-3">
      {icon}
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 break-words text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}
