import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadAppointmentTypePolicies,
  loadAppointmentWizardSettings,
  loadInstructorAppointmentPreferences,
} from "@/domains/planning/application/appointment-policy-service";
import type {
  AppointmentLocationOption,
  DestinationOption,
  InstructorAgendaWizardBootstrap,
  InstructorStudentSearchResult,
  ResolvedAppointmentContext,
  SmartAppointmentCreateResult,
  SmartAppointmentDraft,
} from "@/domains/planning/application/smart-appointment-contracts";
import {
  resolveAppointmentBuffer,
  resolveAppointmentDuration,
  resolveVehicle,
  type AppointmentTypePolicy,
  type AppointmentWizardSettings,
  type InstructorAppointmentPreference,
  type StudentSelectionScope,
  type VehicleCandidate,
  type VehicleResolutionResult,
} from "@/domains/planning/domain/appointment-policy";
import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  canManageAgendaForInstructor,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import {
  isInstructorPlanningType,
  type InstructorPlanningType,
} from "@/lib/agenda/types";
import {
  parseZonedDateTime,
  resolveTenantTimeZone,
  zonedMinuteOfDay,
  zonedYmd,
} from "@/lib/datetime";
import { loadVehicles } from "@/lib/lessons/context-data";
import type { AuthorizedOrganizationContext } from "@/lib/organization";
import type { BranchAccessScope } from "@/lib/permissions";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  type PlanningActorAccess,
  type PlanningCandidateInput,
  type PlanningReason,
  type PlanningValidationResult,
} from "@/lib/planning-core";
import { loadInstructorAccessibleStudentIds } from "@/lib/students/access";
import type { Student } from "@/lib/students/types";
import { createServiceRoleClient } from "@/lib/supabase/service";

type WizardAccess = Readonly<{
  service: SupabaseClient;
  context: AuthorizedOrganizationContext;
  branchScope: BranchAccessScope;
  tenantId: string;
  instructorId: string;
  timeZone: string;
  defaultBranchId: string | null;
}>;

type StudentContextRow = Pick<
  Student,
  | "id"
  | "branch_id"
  | "full_name"
  | "phone"
  | "pickup_address"
  | "address_line"
  | "postcode"
  | "city"
  | "active"
> & { preferred_lesson_duration_minutes?: number | null };

type CanonicalLocation = Readonly<{
  option: AppointmentLocationOption;
  postalCode: string | null;
  city: string | null;
}>;

type ResolutionInput = Readonly<{
  type: InstructorPlanningType;
  studentId?: string | null;
  selectedDate: string;
  selectedTime: string;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  vehicleId?: string | null;
}>;

type InternalResolution = Readonly<{
  context: ResolvedAppointmentContext;
  policy: AppointmentTypePolicy;
  settings: AppointmentWizardSettings;
  preference?: InstructorAppointmentPreference;
  student: StudentContextRow | null;
  startsAt: Date;
  branchId: string | null;
  vehicle: VehicleResolutionResult;
  validation: PlanningValidationResult;
}>;

const SEARCH_LIMIT = 10;
const ROUTE_VALIDATION_REASON_CODES = new Set([
  "INSUFFICIENT_TRAVEL_TIME_BEFORE",
  "INSUFFICIENT_TRAVEL_TIME_AFTER",
  "UNKNOWN_SERVICE_AREA_TRAVEL_TIME",
  "OUTSIDE_INSTRUCTOR_SERVICE_AREA",
]);
const OVERRIDABLE_TRAVEL_REASON_CODES = new Set([
  "INSUFFICIENT_TRAVEL_TIME_BEFORE",
  "INSUFFICIENT_TRAVEL_TIME_AFTER",
]);

export class SmartAppointmentServiceError extends Error {
  readonly code: string;
  readonly safeMessage: string;

  constructor(code: string, safeMessage: string) {
    super(safeMessage);
    this.name = "SmartAppointmentServiceError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

function fail(code: string, message: string): never {
  throw new SmartAppointmentServiceError(code, message);
}

function isMissingColumnOrTable(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

function trimText(value: string | null | undefined, maxLength: number): string {
  return (value ?? "").trim().slice(0, maxLength);
}

function validUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}

async function requireWizardAccess(): Promise<WizardAccess> {
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_MANAGE_ROLES,
  );
  const instructorId = context.user.id;
  if (!canManageAgendaForInstructor(context, instructorId)) {
    fail("FORBIDDEN", "Je hebt geen toestemming om afspraken toe te voegen.");
  }
  return {
    service,
    context,
    branchScope,
    tenantId: context.organization.id,
    instructorId,
    timeZone: resolveTenantTimeZone(context.organization),
    defaultBranchId:
      branchScope.scope_type === "branches"
        ? (branchScope.branch_ids[0] ?? null)
        : null,
  };
}

function planningActor(access: WizardAccess): PlanningActorAccess {
  const canManageTenant =
    Boolean(access.context.user.profile?.is_platform_admin) ||
    access.context.roles.includes("tenant_admin") ||
    access.context.roles.includes("franchise_admin");
  return {
    userId: access.context.user.id,
    roles: access.context.roles,
    isPlatformAdmin: Boolean(access.context.user.profile?.is_platform_admin),
    tenantIds: canManageTenant ? [access.tenantId] : [],
    branchAccess: [
      {
        tenantId: access.tenantId,
        branchIds:
          access.branchScope.scope_type === "all"
            ? "all"
            : access.branchScope.branch_ids,
      },
    ],
  };
}

function parseStart(
  selectedDate: string,
  selectedTime: string,
  timeZone: string,
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    fail("INVALID_DATE", "Kies een geldige datum.");
  }
  const timeMatch = selectedTime.match(/^(\d{2}):(\d{2})$/);
  const hour = Number(timeMatch?.[1]);
  const minute = Number(timeMatch?.[2]);
  if (
    !timeMatch ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    minute % 15 !== 0
  ) {
    fail("INVALID_TIME", "Kies een starttijd op een kwartier.");
  }
  const parsed = parseZonedDateTime(
    `${selectedDate}T${selectedTime}:00`,
    timeZone,
  );
  if (
    !parsed ||
    zonedYmd(parsed, timeZone) !== selectedDate ||
    zonedMinuteOfDay(parsed, timeZone) !== hour * 60 + minute
  ) {
    fail(
      "INVALID_TIME",
      "Deze lokale tijd bestaat niet door de zomer-/wintertijdwisseling.",
    );
  }
  return parsed;
}

function effectiveStudentScope(
  configured: StudentSelectionScope,
  branchScope: BranchAccessScope,
): StudentSelectionScope {
  if (configured === "TENANT_ACTIVE" && branchScope.scope_type === "branches") {
    return "BRANCH_ACTIVE";
  }
  return configured;
}

function branchAllowed(
  branchScope: BranchAccessScope,
  branchId: string | null,
): boolean {
  return (
    branchScope.scope_type === "all" ||
    Boolean(branchId && branchScope.branch_ids.includes(branchId))
  );
}

async function ownStudentIds(access: WizardAccess): Promise<Set<string>> {
  return new Set(
    await loadInstructorAccessibleStudentIds(
      access.service,
      access.tenantId,
      access.instructorId,
    ),
  );
}

async function studentAllowedForScope(
  access: WizardAccess,
  settings: AppointmentWizardSettings,
  student: { id: string; branch_id: string | null },
): Promise<boolean> {
  const scope = effectiveStudentScope(
    settings.studentScope,
    access.branchScope,
  );
  if (scope === "TENANT_ACTIVE") return true;
  if (scope === "BRANCH_ACTIVE") {
    return branchAllowed(access.branchScope, student.branch_id);
  }
  const own = (await ownStudentIds(access)).has(student.id);
  if (scope === "OWN_ACTIVE") return own;
  return own || branchAllowed(access.branchScope, student.branch_id);
}

async function loadSelectedStudent(
  access: WizardAccess,
  settings: AppointmentWizardSettings,
  studentId: string,
): Promise<StudentContextRow> {
  if (!validUuid(studentId)) {
    fail("STUDENT_NOT_FOUND", "De gekozen leerling is niet beschikbaar.");
  }
  const columns =
    "id, branch_id, full_name, phone, pickup_address, address_line, postcode, city, active, preferred_lesson_duration_minutes";
  let result = await access.service
    .from("students")
    .select(columns)
    .eq("tenant_id", access.tenantId)
    .eq("id", studentId)
    .eq("active", true)
    .maybeSingle();
  if (result.error && isMissingColumnOrTable(result.error.message)) {
    result = await access.service
      .from("students")
      .select(
        "id, branch_id, full_name, phone, pickup_address, address_line, postcode, city, active",
      )
      .eq("tenant_id", access.tenantId)
      .eq("id", studentId)
      .eq("active", true)
      .maybeSingle();
  }
  if (result.error) {
    throw new Error(`smart appointment student load: ${result.error.message}`);
  }
  const student = result.data as StudentContextRow | null;
  if (!student || !(await studentAllowedForScope(access, settings, student))) {
    fail("STUDENT_NOT_FOUND", "De gekozen leerling is niet beschikbaar.");
  }
  return student;
}

async function loadCanonicalStudentLocations(
  access: WizardAccess,
  student: StudentContextRow,
  settings: AppointmentWizardSettings,
): Promise<readonly CanonicalLocation[]> {
  const { data: links, error: linksError } = await access.service
    .from("entity_location_links")
    .select("location_record_id, role, label, is_default, created_at")
    .eq("tenant_id", access.tenantId)
    .eq("student_id", student.id)
    .is("valid_until", null)
    .in("role", ["STUDENT_PICKUP_DEFAULT", "STUDENT_HOME", "STUDENT_FAVORITE"])
    .order("created_at", { ascending: false });
  if (linksError && !isMissingColumnOrTable(linksError.message)) {
    throw new Error(`smart appointment locations: ${linksError.message}`);
  }
  const rows = (links ?? []) as Array<{
    location_record_id: string;
    role: string;
    label: string | null;
    is_default: boolean;
  }>;
  const allowedLinks = rows.filter(
    (row) => row.role !== "STUDENT_HOME" || settings.allowStudentHomeAsPickup,
  );
  const recordIds = [
    ...new Set(allowedLinks.map((row) => row.location_record_id)),
  ];
  const canonical: CanonicalLocation[] = [];
  if (recordIds.length > 0) {
    const { data: records, error: recordsError } = await access.service
      .from("location_records")
      .select("id, canonical_version_id")
      .eq("tenant_id", access.tenantId)
      .eq("status", "ACTIVE")
      .in("id", recordIds);
    if (recordsError) {
      throw new Error(
        `smart appointment location records: ${recordsError.message}`,
      );
    }
    const recordRows = (records ?? []) as Array<{
      id: string;
      canonical_version_id: string | null;
    }>;
    const versionIds = recordRows
      .map((row) => row.canonical_version_id)
      .filter((id): id is string => Boolean(id));
    if (versionIds.length > 0) {
      const { data: versions, error: versionsError } = await access.service
        .from("location_versions")
        .select("id, label, formatted_address, postal_code, city")
        .eq("tenant_id", access.tenantId)
        .in("id", versionIds);
      if (versionsError) {
        throw new Error(
          `smart appointment location versions: ${versionsError.message}`,
        );
      }
      const versionsById = new Map(
        (
          (versions ?? []) as Array<{
            id: string;
            label: string;
            formatted_address: string;
            postal_code: string | null;
            city: string | null;
          }>
        ).map((version) => [version.id, version]),
      );
      const recordById = new Map(recordRows.map((row) => [row.id, row]));
      for (const link of allowedLinks) {
        const versionId = recordById.get(
          link.location_record_id,
        )?.canonical_version_id;
        const version = versionId ? versionsById.get(versionId) : null;
        if (!version || !versionId) continue;
        const role =
          link.role === "STUDENT_PICKUP_DEFAULT"
            ? "PICKUP_DEFAULT"
            : link.role === "STUDENT_HOME"
              ? "HOME"
              : "FAVORITE";
        canonical.push({
          option: {
            key: `canonical:${link.location_record_id}`,
            label:
              trimText(link.label, 160) ||
              trimText(version.label, 160) ||
              (role === "HOME" ? "Thuis" : "Ophaalpunt"),
            formattedAddress: version.formatted_address,
            locationRecordId: link.location_record_id,
            locationVersionId: versionId,
            role,
            isDefault:
              link.is_default || link.role === "STUDENT_PICKUP_DEFAULT",
          },
          postalCode: version.postal_code,
          city: version.city,
        });
      }
    }
  }

  const canonicalHasDefault = canonical.some(
    (location) => location.option.role === "PICKUP_DEFAULT",
  );
  const legacyPickup = trimText(student.pickup_address, 500);
  const legacyHome = [
    trimText(student.address_line, 250),
    [trimText(student.postcode, 20), trimText(student.city, 120)]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  if (!canonicalHasDefault && legacyPickup) {
    canonical.push({
      option: {
        key: "legacy:pickup",
        label: "Standaard ophaalpunt",
        formattedAddress: legacyPickup,
        role: "LEGACY",
        isDefault: true,
      },
      postalCode: student.postcode,
      city: student.city,
    });
  } else if (
    !canonicalHasDefault &&
    settings.allowStudentHomeAsPickup &&
    legacyHome
  ) {
    canonical.push({
      option: {
        key: "legacy:home",
        label: "Thuis",
        formattedAddress: legacyHome,
        role: "LEGACY",
        isDefault: true,
      },
      postalCode: student.postcode,
      city: student.city,
    });
  }

  const priority = (location: CanonicalLocation) => {
    if (location.option.role === "PICKUP_DEFAULT") return 0;
    if (location.option.role === "HOME") return 1;
    if (location.option.role === "LEGACY") return 2;
    return 3;
  };
  return Object.freeze(canonical.sort((a, b) => priority(a) - priority(b)));
}

async function loadCbrDestinations(
  access: WizardAccess,
  selectedDate: string,
): Promise<readonly DestinationOption[]> {
  const { data, error } = await access.service
    .from("cbr_locations")
    .select("id, name, address_snapshot, location_record_id")
    .eq("status", "ACTIVE")
    .or(`tenant_id.is.null,tenant_id.eq.${access.tenantId}`)
    .or(`valid_from.is.null,valid_from.lte.${selectedDate}`)
    .or(`valid_until.is.null,valid_until.gte.${selectedDate}`)
    .order("name", { ascending: true })
    .limit(100);
  if (error && isMissingColumnOrTable(error.message)) return [];
  if (error)
    throw new Error(`smart appointment destinations: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    address_snapshot: string;
    location_record_id: string | null;
  }>;
  const recordIds = rows
    .map((row) => row.location_record_id)
    .filter((id): id is string => Boolean(id));
  const canonicalByRecord = new Map<
    string,
    { recordId: string; versionId: string }
  >();
  if (recordIds.length > 0) {
    const { data: records } = await access.service
      .from("location_records")
      .select("id, canonical_version_id")
      .eq("tenant_id", access.tenantId)
      .in("id", recordIds);
    for (const record of (records ?? []) as Array<{
      id: string;
      canonical_version_id: string | null;
    }>) {
      if (record.canonical_version_id) {
        canonicalByRecord.set(record.id, {
          recordId: record.id,
          versionId: record.canonical_version_id,
        });
      }
    }
  }
  return Object.freeze(
    rows.map((row) => {
      const canonical = row.location_record_id
        ? canonicalByRecord.get(row.location_record_id)
        : null;
      return {
        id: row.id,
        label: row.name,
        formattedAddress: row.address_snapshot,
        locationRecordId: canonical?.recordId ?? null,
        locationVersionId: canonical?.versionId ?? null,
      };
    }),
  );
}

function activeBusyStatus(status: string | null | undefined): boolean {
  return ![
    "completed",
    "cancelled",
    "cancelled_with_refund",
    "cancelled_no_refund",
    "no_show",
    "archived",
  ].includes(status ?? "");
}

async function loadVehicleCandidates(
  access: WizardAccess,
  branchId: string | null,
  blockStart: Date,
  blockEnd: Date,
  validateAvailability: boolean,
): Promise<readonly VehicleCandidate[]> {
  const branchIds =
    access.branchScope.scope_type === "branches"
      ? access.branchScope.branch_ids
      : null;
  const vehicles = await loadVehicles(access.service, access.tenantId, {
    branchIds,
    includeShared: true,
    activeOnly: true,
  });
  if (vehicles.length === 0) return [];
  const ids = vehicles.map((vehicle) => vehicle.id);
  let defaultFlags = new Map<
    string,
    { is_branch_default: boolean; is_tenant_default: boolean }
  >();
  const defaultsResult = await access.service
    .from("vehicles")
    .select("id, is_branch_default, is_tenant_default")
    .eq("tenant_id", access.tenantId)
    .in("id", ids);
  if (!defaultsResult.error) {
    defaultFlags = new Map(
      (
        (defaultsResult.data ?? []) as Array<{
          id: string;
          is_branch_default: boolean;
          is_tenant_default: boolean;
        }>
      ).map((row) => [row.id, row]),
    );
  } else if (!isMissingColumnOrTable(defaultsResult.error.message)) {
    throw new Error(
      `smart appointment vehicle defaults: ${defaultsResult.error.message}`,
    );
  }

  const unavailable = new Set<string>();
  if (validateAvailability) {
    const [lessons, appointments, trials, maintenance] = await Promise.all([
      access.service
        .from("lessons")
        .select("vehicle_id, status")
        .eq("tenant_id", access.tenantId)
        .in("vehicle_id", ids)
        .lt("starts_at", blockEnd.toISOString())
        .gt("ends_at", blockStart.toISOString()),
      access.service
        .from("agenda_appointments")
        .select("vehicle_id, status")
        .eq("tenant_id", access.tenantId)
        .in("vehicle_id", ids)
        .lt("starts_at", blockEnd.toISOString())
        .gt("ends_at", blockStart.toISOString()),
      access.service
        .from("trial_lessons")
        .select("vehicle_id, status")
        .eq("tenant_id", access.tenantId)
        .in("vehicle_id", ids)
        .lt("starts_at", blockEnd.toISOString())
        .gt("ends_at", blockStart.toISOString()),
      access.service
        .from("vehicle_maintenance_events")
        .select("vehicle_id, status, blocks_planning")
        .eq("tenant_id", access.tenantId)
        .in("vehicle_id", ids)
        .eq("blocks_planning", true)
        .lt("starts_at", blockEnd.toISOString())
        .gt("ends_at", blockStart.toISOString()),
    ]);
    for (const result of [lessons, appointments, trials, maintenance]) {
      if (result.error) {
        throw new Error(
          `smart appointment vehicle availability: ${result.error.message}`,
        );
      }
      for (const row of (result.data ?? []) as Array<{
        vehicle_id: string | null;
        status: string | null;
        blocks_planning?: boolean;
      }>) {
        if (
          row.vehicle_id &&
          activeBusyStatus(row.status) &&
          row.blocks_planning !== false
        ) {
          unavailable.add(row.vehicle_id);
        }
      }
    }
  }
  return Object.freeze(
    vehicles.map((vehicle) => {
      const flags = defaultFlags.get(vehicle.id);
      return {
        id: vehicle.id,
        label: vehicle.license_plate
          ? `${vehicle.label} · ${vehicle.license_plate}`
          : vehicle.label,
        branchId: vehicle.branch_id,
        status: vehicle.status,
        transmission: vehicle.transmission,
        defaultInstructorId: vehicle.default_instructor_id,
        isBranchDefault:
          flags?.is_branch_default === true &&
          Boolean(branchId && vehicle.branch_id === branchId),
        isTenantDefault: flags?.is_tenant_default === true,
        available: !unavailable.has(vehicle.id),
        capabilityMatch: true,
      };
    }),
  );
}

function selectedVehicleResolution(
  base: VehicleResolutionResult,
  requestedVehicleId: string | null | undefined,
  policy: AppointmentTypePolicy,
  settings: AppointmentWizardSettings,
): VehicleResolutionResult {
  if (!requestedVehicleId) return base;
  if (policy.vehicleRequirement === "NONE") {
    fail(
      "VEHICLE_NOT_ALLOWED",
      "Voor dit afspraaktype is geen voertuig nodig.",
    );
  }
  const selected = base.candidates.find(
    (candidate) => candidate.id === requestedVehicleId && candidate.available,
  );
  if (!selected) {
    fail("VEHICLE_UNAVAILABLE", "Het gekozen voertuig is niet beschikbaar.");
  }
  if (
    settings.vehicleSelectionMode !== "ALWAYS_SELECT" &&
    (!settings.instructorMayOverrideVehicle ||
      !policy.instructorCanOverrideVehicle) &&
    base.vehicle?.id !== selected.id
  ) {
    fail(
      "VEHICLE_LOCKED",
      "Het automatisch toegewezen voertuig kan niet worden gewijzigd.",
    );
  }
  return Object.freeze({
    status: "RESOLVED",
    vehicle: selected,
    candidates: base.candidates,
    source: "MANUAL",
  });
}

function validateDurationAndBuffer(
  policy: AppointmentTypePolicy,
  suggestedDuration: number,
  suggestedBefore: number,
  suggestedAfter: number,
  input: ResolutionInput,
): { duration: number; before: number; after: number } {
  const duration = input.durationMinutes ?? suggestedDuration;
  const before = input.bufferBeforeMinutes ?? suggestedBefore;
  const after = input.bufferAfterMinutes ?? suggestedAfter;
  if (
    !Number.isInteger(duration) ||
    duration < policy.minDurationMinutes ||
    duration > policy.maxDurationMinutes ||
    (duration - policy.minDurationMinutes) % policy.durationStepMinutes !== 0
  ) {
    fail("INVALID_DURATION", "De gekozen duur valt buiten het afspraakbeleid.");
  }
  if (!policy.instructorCanOverrideDuration && duration !== suggestedDuration) {
    fail("DURATION_LOCKED", "De duur is door de rijschool vastgezet.");
  }
  if (
    !Number.isInteger(before) ||
    !Number.isInteger(after) ||
    before < policy.minBufferBeforeMinutes ||
    after < policy.minBufferAfterMinutes ||
    before > 240 ||
    after > 240
  ) {
    fail("INVALID_BUFFER", "De gekozen planningbuffer is niet geldig.");
  }
  if (
    !policy.instructorCanOverrideBuffer &&
    (before !== suggestedBefore || after !== suggestedAfter)
  ) {
    fail("BUFFER_LOCKED", "De planningbuffer is door de rijschool vastgezet.");
  }
  return { duration, before, after };
}

function withoutRouteValidation(
  validation: PlanningValidationResult,
): PlanningValidationResult {
  const blockingReasons = validation.blockingReasons.filter(
    (item) => !ROUTE_VALIDATION_REASON_CODES.has(item.code),
  );
  const warnings = validation.warnings.filter(
    (item) => !ROUTE_VALIDATION_REASON_CODES.has(item.code),
  );
  return { allowed: blockingReasons.length === 0, blockingReasons, warnings };
}

function vehicleRequirementReason(): PlanningReason {
  return {
    code: "VEHICLE_NOT_FOUND",
    message: "Kies een beschikbaar voertuig om verder te gaan.",
    severity: "blocking",
  };
}

async function resolveInternal(
  access: WizardAccess,
  input: ResolutionInput,
): Promise<InternalResolution> {
  const startsAt = parseStart(
    input.selectedDate,
    input.selectedTime,
    access.timeZone,
  );
  const [policies, settings, preferences] = await Promise.all([
    loadAppointmentTypePolicies(access.service, access.tenantId),
    loadAppointmentWizardSettings(access.service, access.tenantId),
    loadInstructorAppointmentPreferences(
      access.service,
      access.tenantId,
      access.instructorId,
    ),
  ]);
  const policy = policies.find((item) => item.code === input.type);
  if (!policy || !policy.isActive) {
    fail("TYPE_UNAVAILABLE", "Dit afspraaktype is niet beschikbaar.");
  }
  if (policy.studentRequirement === "REQUIRED" && !input.studentId) {
    fail("STUDENT_REQUIRED", "Kies een leerling.");
  }
  if (policy.studentRequirement === "FORBIDDEN" && input.studentId) {
    fail(
      "STUDENT_FORBIDDEN",
      "Dit afspraaktype kan niet aan een leerling worden gekoppeld.",
    );
  }
  const student = input.studentId
    ? await loadSelectedStudent(access, settings, input.studentId)
    : null;
  const branchId = student?.branch_id ?? access.defaultBranchId;
  if (branchId && !branchAllowed(access.branchScope, branchId)) {
    fail("BRANCH_FORBIDDEN", "De gekozen vestiging valt buiten je toegang.");
  }
  const preference = preferences.find(
    (item) => item.appointmentTypeCode === policy.code,
  );
  const duration = resolveAppointmentDuration({
    policy,
    studentMinutes:
      policy.code === "lesson"
        ? student?.preferred_lesson_duration_minutes
        : null,
    instructorMinutes: preference?.durationMinutes,
  });
  const buffer = resolveAppointmentBuffer({
    policy,
    instructorBeforeMinutes: preference?.bufferBeforeMinutes,
    instructorAfterMinutes: preference?.bufferAfterMinutes,
  });
  const selectedSchedule = validateDurationAndBuffer(
    policy,
    duration.minutes,
    buffer.beforeMinutes,
    buffer.afterMinutes,
    input,
  );
  const blockStart = new Date(
    startsAt.getTime() - selectedSchedule.before * 60_000,
  );
  const blockEnd = new Date(
    startsAt.getTime() +
      (selectedSchedule.duration + selectedSchedule.after) * 60_000,
  );
  const [locations, destinations, vehicleCandidates] = await Promise.all([
    student
      ? loadCanonicalStudentLocations(access, student, settings)
      : Promise.resolve([] as readonly CanonicalLocation[]),
    policy.locationRequirement === "DESTINATION" ||
    policy.locationRequirement === "PICKUP_AND_DESTINATION"
      ? loadCbrDestinations(access, input.selectedDate)
      : Promise.resolve([] as readonly DestinationOption[]),
    policy.vehicleRequirement !== "NONE"
      ? loadVehicleCandidates(
          access,
          branchId,
          blockStart,
          blockEnd,
          settings.validateVehicleAvailability,
        )
      : Promise.resolve([] as readonly VehicleCandidate[]),
  ]);
  const baseVehicle = resolveVehicle({
    policy,
    settings,
    instructorId: access.instructorId,
    branchId,
    instructorPreferenceVehicleId: preference?.preferredVehicleId,
    vehicles: vehicleCandidates,
  });
  const vehicle = selectedVehicleResolution(
    baseVehicle,
    input.vehicleId,
    policy,
    settings,
  );
  const candidate: PlanningCandidateInput = {
    actor: planningActor(access),
    scope: branchId
      ? { type: "branch", tenantId: access.tenantId, branchId }
      : { type: "tenant", tenantId: access.tenantId },
    entityType: policy.code === "lesson" ? "lesson" : "agenda_appointment",
    tenantId: access.tenantId,
    timeZone: access.timeZone,
    branchId,
    studentId: student?.id ?? null,
    instructorId: access.instructorId,
    vehicleId: vehicle.vehicle?.id ?? null,
    startAt: blockStart,
    endAt: blockEnd,
  };
  const kernelData = await loadPlanningKernelData(access.service, candidate);
  let validation = await getPlanningPreview(candidate, kernelData);
  if (!policy.routeValidationEnabled) {
    validation = withoutRouteValidation(validation);
  }
  const vehicleIsRequired =
    policy.vehicleRequirement === "REQUIRED" ||
    (policy.vehicleRequirement === "AUTO" && settings.vehicleRequired);
  if (vehicleIsRequired && vehicle.status !== "RESOLVED") {
    validation = {
      allowed: false,
      blockingReasons: [
        ...validation.blockingReasons,
        vehicleRequirementReason(),
      ],
      warnings: validation.warnings,
    };
  }
  const defaultLocation =
    locations.find((location) => location.option.isDefault) ?? locations[0];
  const context: ResolvedAppointmentContext = {
    student: student
      ? {
          id: student.id,
          displayName: student.full_name,
          ...(student.phone ? { phone: student.phone } : {}),
          branchId: student.branch_id,
        }
      : undefined,
    pickup: {
      defaultLocation: defaultLocation?.option,
      alternatives: locations
        .filter((location) => location !== defaultLocation)
        .map((location) => location.option),
    },
    destinations,
    duration: {
      suggestedMinutes: duration.minutes,
      source: duration.source,
      locked: duration.locked,
    },
    buffer: {
      beforeMinutes: buffer.beforeMinutes,
      afterMinutes: buffer.afterMinutes,
      source: buffer.source,
      locked: buffer.locked,
    },
    vehicle,
    planning: validation,
  };
  return {
    context,
    policy,
    settings,
    preference,
    student,
    startsAt,
    branchId,
    vehicle,
    validation,
  };
}

export async function loadInstructorAgendaWizardBootstrap(): Promise<InstructorAgendaWizardBootstrap> {
  const access = await requireWizardAccess();
  const [policies, settings] = await Promise.all([
    loadAppointmentTypePolicies(access.service, access.tenantId),
    loadAppointmentWizardSettings(access.service, access.tenantId),
  ]);
  return {
    instructorId: access.instructorId,
    instructorLabel: access.context.user.profile?.full_name ?? "Jij",
    timeZone: access.timeZone,
    defaultBranchId: access.defaultBranchId,
    policies: policies.filter((policy) => policy.isActive),
    settings,
  };
}

export async function searchInstructorStudents(
  query: string,
): Promise<readonly InstructorStudentSearchResult[]> {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 100);
  if (normalized.length < 3) return [];
  const access = await requireWizardAccess();
  const settings = await loadAppointmentWizardSettings(
    access.service,
    access.tenantId,
  );
  const scope = effectiveStudentScope(
    settings.studentScope,
    access.branchScope,
  );
  const branchIds =
    access.branchScope.scope_type === "branches"
      ? access.branchScope.branch_ids
      : null;
  const { data, error } = await access.service.rpc(
    "search_instructor_students",
    {
      p_tenant_id: access.tenantId,
      p_actor: access.instructorId,
      p_query: normalized,
      p_scope: scope,
      p_branch_ids: branchIds,
      p_limit: SEARCH_LIMIT,
    },
  );
  if (error) {
    throw new Error(`smart appointment student search: ${error.message}`);
  }
  let rows = (data ?? []) as Array<{
    id: string;
    display_name: string;
    branch_id: string | null;
    relation_label: string;
  }>;
  if (access.branchScope.scope_type === "branches") {
    rows = rows.filter((row) =>
      branchAllowed(access.branchScope, row.branch_id),
    );
  }
  return Object.freeze(
    rows.slice(0, SEARCH_LIMIT).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      contextualLabel: row.relation_label || "Actieve leerling",
    })),
  );
}

export async function resolveInstructorAppointmentContext(input: {
  type: InstructorPlanningType;
  studentId?: string | null;
  selectedDate: string;
  selectedTime: string;
}): Promise<ResolvedAppointmentContext> {
  if (!isInstructorPlanningType(input.type)) {
    fail("INVALID_TYPE", "Kies een geldig afspraaktype.");
  }
  const access = await requireWizardAccess();
  return (await resolveInternal(access, input)).context;
}

function findCanonicalPickup(
  resolved: ResolvedAppointmentContext,
  draft: SmartAppointmentDraft,
): AppointmentLocationOption | null {
  if (draft.temporaryPickup) return null;
  if (!draft.pickup) return null;
  const options = [
    resolved.pickup.defaultLocation,
    ...resolved.pickup.alternatives,
  ].filter((option): option is AppointmentLocationOption => Boolean(option));
  const selected = options.find(
    (option) =>
      option.key === draft.pickup?.key &&
      (option.locationRecordId ?? null) ===
        (draft.pickup?.locationRecordId ?? null) &&
      (option.locationVersionId ?? null) ===
        (draft.pickup?.locationVersionId ?? null),
  );
  if (!selected) {
    fail("PICKUP_INVALID", "Het gekozen ophaalpunt is niet meer beschikbaar.");
  }
  return selected;
}

function findDestination(
  resolved: ResolvedAppointmentContext,
  draft: SmartAppointmentDraft,
): DestinationOption | null {
  if (draft.temporaryDestination) return null;
  if (!draft.destination) return null;
  const selected = resolved.destinations.find(
    (option) =>
      option.id === draft.destination?.id &&
      (option.locationRecordId ?? null) ===
        (draft.destination?.locationRecordId ?? null) &&
      (option.locationVersionId ?? null) ===
        (draft.destination?.locationVersionId ?? null),
  );
  if (!selected) {
    fail(
      "DESTINATION_INVALID",
      "De gekozen bestemming is niet meer beschikbaar.",
    );
  }
  return selected;
}

function validateAddressDraft(
  value: SmartAppointmentDraft["temporaryPickup"],
  label: string,
): string | null {
  if (!value) return null;
  const formatted = trimText(value.formattedAddress, 500);
  if (!formatted) fail("LOCATION_INVALID", `${label} is niet geldig.`);
  const hasLat = typeof value.latitude === "number";
  const hasLng = typeof value.longitude === "number";
  if (
    hasLat !== hasLng ||
    (hasLat && (value.latitude! < -90 || value.latitude! > 90)) ||
    (hasLng && (value.longitude! < -180 || value.longitude! > 180))
  ) {
    fail("LOCATION_INVALID", `${label} bevat ongeldige coördinaten.`);
  }
  return formatted;
}

function validateDraftLocations(
  resolution: InternalResolution,
  draft: SmartAppointmentDraft,
): {
  pickup: AppointmentLocationOption | null;
  destination: DestinationOption | null;
  pickupText: string | null;
  destinationText: string | null;
} {
  const pickup = findCanonicalPickup(resolution.context, draft);
  const destination = findDestination(resolution.context, draft);
  const pickupText =
    validateAddressDraft(draft.temporaryPickup, "Het tijdelijke ophaalpunt") ??
    pickup?.formattedAddress ??
    null;
  const destinationText =
    validateAddressDraft(
      draft.temporaryDestination,
      "De tijdelijke bestemming",
    ) ??
    destination?.formattedAddress ??
    null;
  if (
    (resolution.policy.locationRequirement === "PICKUP" ||
      resolution.policy.locationRequirement === "PICKUP_AND_DESTINATION") &&
    !pickupText
  ) {
    fail("PICKUP_REQUIRED", "Kies een ophaalpunt.");
  }
  if (
    (resolution.policy.locationRequirement === "DESTINATION" ||
      resolution.policy.locationRequirement === "PICKUP_AND_DESTINATION") &&
    !destinationText
  ) {
    fail("DESTINATION_REQUIRED", "Kies een bestemming.");
  }
  return { pickup, destination, pickupText, destinationText };
}

export async function previewSmartAppointment(
  draft: SmartAppointmentDraft,
): Promise<ResolvedAppointmentContext> {
  if (!isInstructorPlanningType(draft.type)) {
    fail("INVALID_TYPE", "Kies een geldig afspraaktype.");
  }
  const access = await requireWizardAccess();
  const resolution = await resolveInternal(access, draft);
  validateDraftLocations(resolution, draft);
  return resolution.context;
}

function mapCreateError(message: string): SmartAppointmentServiceError {
  if (/policy changed/i.test(message)) {
    return new SmartAppointmentServiceError(
      "POLICY_CHANGED",
      "De rijschoolinstellingen zijn gewijzigd. Controleer de afspraak opnieuw.",
    );
  }
  if (/overlapping|not available|not active/i.test(message)) {
    return new SmartAppointmentServiceError(
      "PLANNING_CONFLICT",
      "Het tijdslot of voertuig is inmiddels niet meer beschikbaar.",
    );
  }
  if (/not authorized|forbidden/i.test(message)) {
    return new SmartAppointmentServiceError(
      "FORBIDDEN",
      "Je hebt geen toestemming om deze afspraak toe te voegen.",
    );
  }
  return new SmartAppointmentServiceError(
    "CREATE_FAILED",
    "De afspraak kon niet worden toegevoegd. Probeer het opnieuw.",
  );
}

function addressSnapshot(
  value: SmartAppointmentDraft["temporaryPickup"],
): Record<string, string | number | null> | null {
  if (!value) return null;
  const countryCode = trimText(value.countryCode, 2).toUpperCase();
  return {
    formattedAddress: trimText(value.formattedAddress, 500),
    label: trimText(value.label, 160) || "Tijdelijke locatie",
    street: trimText(value.street, 160) || null,
    houseNumber: trimText(value.houseNumber, 40) || null,
    houseNumberAddition: trimText(value.houseNumberAddition, 40) || null,
    postalCode: trimText(value.postalCode, 20).toUpperCase() || null,
    city: trimText(value.city, 120) || null,
    region: trimText(value.region, 120) || null,
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "NL",
    latitude: typeof value.latitude === "number" ? value.latitude : null,
    longitude: typeof value.longitude === "number" ? value.longitude : null,
    provider: value.provider === "GOOGLE" ? "GOOGLE" : null,
    providerPlaceId:
      value.provider === "GOOGLE"
        ? trimText(value.providerPlaceId, 300) || null
        : null,
    source:
      value.source === "GOOGLE_PLACES" || value.source === "USER_CONFIRMED"
        ? value.source
        : "USER_ENTERED",
    validationStatus: trimText(value.validationStatus, 40) || "UNVALIDATED",
    changeReason: trimText(value.changeReason, 500) || null,
  };
}

export async function createSmartAppointment(
  draft: SmartAppointmentDraft,
): Promise<SmartAppointmentCreateResult> {
  if (!isInstructorPlanningType(draft.type)) {
    fail("INVALID_TYPE", "Kies een geldig afspraaktype.");
  }
  const access = await requireWizardAccess();
  // Final resolution deliberately reloads policy, student scope, vehicle
  // availability and planning data. The client preview is never trusted.
  const resolution = await resolveInternal(access, draft);
  const locations = validateDraftLocations(resolution, draft);
  const nonTravelBlockers = resolution.validation.blockingReasons.filter(
    (reason) => !OVERRIDABLE_TRAVEL_REASON_CODES.has(reason.code),
  );
  const travelBlockers = resolution.validation.blockingReasons.filter(
    (reason) => OVERRIDABLE_TRAVEL_REASON_CODES.has(reason.code),
  );
  if (nonTravelBlockers.length > 0) {
    fail(
      "PLANNING_CONFLICT",
      nonTravelBlockers[0]?.message ??
        "Deze afspraak past niet in de planning.",
    );
  }
  const requestedOverride = trimText(draft.overrideReason, 500);
  if (
    travelBlockers.length > 0 &&
    resolution.settings.routeOverrideRequiresReason &&
    !requestedOverride
  ) {
    fail(
      "OVERRIDE_REASON_REQUIRED",
      "Geef een reden om deze planningwaarschuwing te overrulen.",
    );
  }
  if (draft.type === "private_block" && !trimText(draft.title, 120)) {
    fail("TITLE_REQUIRED", "Vul een titel voor de privé-afspraak in.");
  }
  const title = trimText(draft.title, 120) || resolution.policy.label;
  const notes = trimText(draft.notes, 2_000) || null;
  const locationText = locations.pickupText ?? locations.destinationText;
  const vehicleId = resolution.vehicle.vehicle?.id ?? null;
  const duration = draft.durationMinutes;
  const before = draft.bufferBeforeMinutes;
  const after = draft.bufferAfterMinutes;
  const overrideReason =
    travelBlockers.length > 0
      ? requestedOverride || "Planningwaarschuwing geaccepteerd"
      : null;
  const { data, error } = await access.service.rpc("create_smart_appointment", {
    p_tenant_id: access.tenantId,
    p_actor: access.instructorId,
    p_instructor_id: access.instructorId,
    p_type: draft.type,
    p_student_id: resolution.student?.id ?? null,
    p_starts_at: resolution.startsAt.toISOString(),
    p_duration_minutes: duration,
    p_buffer_before_minutes: before,
    p_buffer_after_minutes: after,
    p_branch_id: resolution.branchId,
    p_title: title,
    p_location: locationText,
    p_notes: notes,
    p_vehicle_id: vehicleId,
    p_pickup_service_area_id: null,
    p_policy_version: resolution.policy.version,
    p_policy_snapshot: resolution.policy,
    p_vehicle_resolution_source: resolution.vehicle.source,
    p_override_reason: overrideReason,
    p_pickup_location_record_id: locations.pickup?.locationRecordId ?? null,
    p_pickup_location_version_id: locations.pickup?.locationVersionId ?? null,
    p_pickup_snapshot: addressSnapshot(draft.temporaryPickup),
    p_destination_location_record_id:
      locations.destination?.locationRecordId ?? null,
    p_destination_location_version_id:
      locations.destination?.locationVersionId ?? null,
    p_destination_snapshot: addressSnapshot(draft.temporaryDestination),
  });
  if (error) throw mapCreateError(error.message);
  const payload = data as { id?: unknown; kind?: unknown } | null;
  if (typeof payload?.id !== "string") {
    fail(
      "CREATE_FAILED",
      "De afspraak kon niet worden toegevoegd. Probeer het opnieuw.",
    );
  }
  const result: SmartAppointmentCreateResult = {
    id: payload.id,
    kind: typeof payload.kind === "string" ? payload.kind : draft.type,
    selectedDate: draft.selectedDate,
  };
  if (resolution.policy.notifyStudentOnCreate) {
    try {
      const { notifyExamPlanned, notifyParentsLessonScheduled } =
        await import("@/lib/notifications/dispatch");
      if (draft.type === "lesson") {
        await notifyParentsLessonScheduled(
          access.service,
          access.tenantId,
          payload.id,
        );
      } else if (draft.type === "exam" || draft.type === "interim_test") {
        await notifyExamPlanned(access.service, access.tenantId, payload.id);
      }
    } catch (error) {
      // Appointment integrity wins over best-effort communication; the
      // notification dispatchers are idempotent and can safely be retried.
      console.error("[appointment-wizard] create notification failed", error);
    }
  }
  return result;
}
