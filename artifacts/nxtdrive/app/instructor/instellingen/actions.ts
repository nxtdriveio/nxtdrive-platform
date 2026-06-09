"use server";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateInstructorProfile(formData: FormData) {
  const { user } = await requireActiveTenant(["instructor", "tenant_admin"]);

  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";
  if (!fullName) return { error: "Naam mag niet leeg zijn." };
  if (fullName.length > 100) return { error: "Naam is te lang (max 100 tekens)." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) return { error: "Profiel kon niet worden opgeslagen." };

  revalidatePath("/instructor/instellingen");
  return { error: null };
}

export async function updateInstructorAgendaPreferences(formData: FormData) {
  const { user } = await requireActiveTenant(["instructor", "tenant_admin"]);

  const startHour = Number(formData.get("calendar_start_hour"));
  const endHour = Number(formData.get("calendar_end_hour"));

  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    return { error: "Startuur moet tussen 00:00 en 23:00 liggen." };
  }
  if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
    return { error: "Einduur moet tussen 01:00 en 24:00 liggen." };
  }
  if (startHour >= endHour) {
    return { error: "Het startuur moet voor het einduur liggen." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      calendar_start_hour: startHour,
      calendar_end_hour: endHour,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Agenda-instellingen konden niet worden opgeslagen." };
  }

  revalidatePath("/instructor");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor/instellingen");
  return { error: null };
}
