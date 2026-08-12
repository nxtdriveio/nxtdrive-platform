import type { PlanningReason } from "@/lib/planning-core";
import type { InstructorPlanningType } from "@/lib/agenda/types";
import type {
  AppointmentTypePolicy,
  AppointmentValueSource,
  AppointmentWizardSettings,
  VehicleResolutionResult,
} from "../domain/appointment-policy";

export type InstructorAgendaWizardBootstrap = Readonly<{
  instructorId: string;
  instructorLabel: string;
  timeZone: string;
  defaultBranchId: string | null;
  policies: readonly AppointmentTypePolicy[];
  settings: AppointmentWizardSettings;
}>;

export type InstructorStudentSearchResult = Readonly<{
  id: string;
  displayName: string;
  contextualLabel: string;
}>;

export type AppointmentLocationOption = Readonly<{
  key: string;
  label: string;
  formattedAddress: string;
  locationRecordId?: string | null;
  locationVersionId?: string | null;
  role: "PICKUP_DEFAULT" | "HOME" | "FAVORITE" | "LEGACY" | "TEMPORARY";
  isDefault: boolean;
}>;

export type DestinationOption = Readonly<{
  id: string;
  label: string;
  formattedAddress: string;
  locationRecordId?: string | null;
  locationVersionId?: string | null;
}>;

export type ResolvedAppointmentContext = Readonly<{
  student?: {
    id: string;
    displayName: string;
    phone?: string;
    branchId?: string | null;
  };
  pickup: {
    defaultLocation?: AppointmentLocationOption;
    alternatives: readonly AppointmentLocationOption[];
  };
  destinations: readonly DestinationOption[];
  duration: {
    suggestedMinutes: number;
    source: AppointmentValueSource;
    locked: boolean;
  };
  buffer: {
    beforeMinutes: number;
    afterMinutes: number;
    source: Exclude<AppointmentValueSource, "STUDENT">;
    locked: boolean;
  };
  vehicle: VehicleResolutionResult;
  planning: {
    allowed: boolean;
    blockingReasons: readonly PlanningReason[];
    warnings: readonly PlanningReason[];
  };
}>;

export type AppointmentAddressDraft = Readonly<{
  formattedAddress: string;
  label?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  houseNumberAddition?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  provider?: string | null;
  providerPlaceId?: string | null;
  source?: string | null;
  validationStatus?: string | null;
  changeReason?: string | null;
}>;

export type SmartAppointmentDraft = Readonly<{
  type: InstructorPlanningType;
  studentId?: string | null;
  selectedDate: string;
  selectedTime: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  title?: string | null;
  notes?: string | null;
  pickup?: AppointmentLocationOption | null;
  temporaryPickup?: AppointmentAddressDraft | null;
  destination?: DestinationOption | null;
  temporaryDestination?: AppointmentAddressDraft | null;
  vehicleId?: string | null;
  overrideReason?: string | null;
}>;

export type WizardActionResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; error: string; code?: string }>;

export type SmartAppointmentCreateResult = Readonly<{
  id: string;
  kind: string;
  selectedDate: string;
}>;
