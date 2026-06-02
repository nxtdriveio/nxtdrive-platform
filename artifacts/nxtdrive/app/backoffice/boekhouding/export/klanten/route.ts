import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { amsterdamYmd } from "@/lib/dashboard/metrics";
import { buildCsv, csvResponse } from "@/lib/accounting/csv";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

/** Klantenexport — all students (customers) of the active tenant. */
export async function GET() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("students")
    .select("full_name, email, phone, postcode, active, created_at")
    .eq("tenant_id", tenant.id)
    .order("full_name", { ascending: true });
  if (error) {
    throw new Error(`klantenexport read failed: ${error.message}`);
  }

  const header = [
    "Naam",
    "E-mail",
    "Telefoon",
    "Postcode",
    "Actief",
    "Aangemaakt op",
  ];
  const rows = (
    (data ?? []) as Pick<
      Student,
      "full_name" | "email" | "phone" | "postcode" | "active" | "created_at"
    >[]
  ).map((s) => [
    s.full_name,
    s.email ?? "",
    s.phone ?? "",
    s.postcode ?? "",
    s.active ? "Ja" : "Nee",
    s.created_at ? amsterdamYmd(new Date(s.created_at)) : "",
  ]);

  const csv = buildCsv(header, rows);
  return csvResponse(csv, `klantenexport_${amsterdamYmd(new Date())}.csv`);
}
