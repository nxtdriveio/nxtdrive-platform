"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function recordTravelStatus(input: {
  appointmentId: string;
  status: "ON_MY_WAY" | "ARRIVED" | "DELAYED";
}): Promise<{ ok: boolean; error?: string }> {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  if (!/^[0-9a-f-]{36}$/i.test(input.appointmentId)) {
    return { ok: false, error: "Ongeldige afspraak." };
  }
  const service = createServiceRoleClient();
  const { data: lesson } = await service
    .from("lessons")
    .select("id")
    .eq("id", input.appointmentId)
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .eq("status", "planned")
    .maybeSingle();
  if (!lesson) return { ok: false, error: "Afspraak niet gevonden." };
  const { error } = await service
    .from("appointment_travel_status_events")
    .insert({
      tenant_id: tenant.id,
      appointment_type: "LESSON",
      appointment_id: input.appointmentId,
      instructor_user_id: user.id,
      status: input.status,
      created_by: user.id,
    });
  if (error) return { ok: false, error: "Status kon niet worden opgeslagen." };
  revalidatePath("/instructeur/dagroute");
  return { ok: true };
}
