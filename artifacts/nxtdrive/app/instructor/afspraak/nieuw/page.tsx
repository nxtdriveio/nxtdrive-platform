import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadTenantInstructors } from "@/lib/availability/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { createAppointment } from "@/lib/agenda/actions";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

const FORM_PATH = "/instructor/afspraak/nieuw";

export default async function NewInstructorAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const sp = await searchParams;
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const supabase = await createServerSupabaseClient();
  // Admins may pick any instructor; instructors are pinned to themselves.
  const instructors = isAdmin
    ? await loadTenantInstructors(tenant.id)
    : undefined;

  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("full_name", { ascending: true });
  const students = (studentsRaw ?? []) as Pick<Student, "id" | "full_name">[];

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  return (
    <div className="space-y-6">
      <Link
        href="/instructor/week"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar weekplanning
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Nieuwe afspraak
        </h1>
        <p className="text-sm text-muted-foreground">
          Examen, tussentijdse toets, theoriebegeleiding of een blok dat tijd
          bezet.
        </p>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Aanmaken mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Afspraak inplannen</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentForm
            action={createAppointment}
            mode="create"
            redirectTo="/instructor/week"
            errorTo={FORM_PATH}
            instructors={instructors}
            ownInstructor={
              isAdmin
                ? undefined
                : { id: user.id, full_name: user.profile?.full_name ?? "Jij" }
            }
            students={students}
            defaults={{
              date: now.toISOString().slice(0, 10),
              time: now.toISOString().slice(11, 16),
            }}
            submitLabel="Afspraak inplannen"
          />
        </CardContent>
      </Card>
    </div>
  );
}
