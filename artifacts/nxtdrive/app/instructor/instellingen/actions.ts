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
