"use server";

import { revalidatePath } from "next/cache";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  validateLocationVersionDraft,
  type LocationVersionDraft,
} from "@/domains/maps/domain/location";

export type SaveStudentLocationInput = Omit<
  LocationVersionDraft,
  "tenantId" | "locationRecordId" | "versionNumber"
> & {
  role:
    | "STUDENT_HOME"
    | "STUDENT_PICKUP_DEFAULT"
    | "STUDENT_DROPOFF_DEFAULT"
    | "STUDENT_FAVORITE";
  locationRecordId?: string | null;
};

export async function saveStudentLocation(
  input: SaveStudentLocationInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, tenant, student } = await getStudentPwaContext();
  if (!student) return { ok: false, error: "Geen actief leerlingprofiel." };
  try {
    const validated = validateLocationVersionDraft({
      ...input,
      tenantId: tenant.id,
      locationRecordId: input.locationRecordId ?? crypto.randomUUID(),
      versionNumber: 1,
    });
    const service = createServiceRoleClient();
    const { error } = await service.rpc("upsert_student_location", {
      p_tenant_id: tenant.id,
      p_student_id: student.id,
      p_actor: user.id,
      p_role: input.role,
      p_label: validated.label,
      p_formatted_address: validated.formattedAddress,
      p_street: validated.street ?? null,
      p_house_number: validated.houseNumber ?? null,
      p_house_number_addition: validated.houseNumberAddition ?? null,
      p_postal_code: validated.postalCode ?? null,
      p_city: validated.city ?? null,
      p_region: validated.region ?? null,
      p_country_code: validated.countryCode ?? "NL",
      p_latitude: validated.coordinates?.latitude ?? null,
      p_longitude: validated.coordinates?.longitude ?? null,
      p_source: validated.source,
      p_provider: validated.provider ?? null,
      p_provider_place_id: validated.providerPlaceId ?? null,
      p_validation_status: validated.validationStatus ?? "UNVALIDATED",
      p_change_reason: validated.changeReason ?? null,
      p_location_record_id: input.locationRecordId ?? null,
    });
    if (error) throw error;
    revalidatePath("/leerling/instellingen/locaties");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "De locatie kon niet worden opgeslagen. Controleer het adres en de bevestigingsreden.",
    };
  }
}
