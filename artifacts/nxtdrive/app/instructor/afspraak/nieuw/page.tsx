import Link from "next/link";
import { CalendarPlus2, ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { loadTenantInstructors } from "@/lib/availability/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { createAppointment } from "@/lib/agenda/actions";
import type { Student } from "@/lib/students/types";
import { cn } from "@/lib/utils";

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
    <PWAPage app="instructor" contentClassName="space-y-6">
      <PWAPageHeader
        eyebrow="Planning"
        title="Nieuwe agenda-afspraak"
        description="Gebruik dit scherm voor examens, tussentijdse toetsen, theoriebegeleiding en andere agenda-items of blokkades. Reguliere lessen plan je via de lesplanner."
        align="left"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/instructor/week"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Terug naar agenda
            </Link>
            <Link
              href="/instructor/les/nieuw"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CalendarPlus2 className="h-4 w-4" aria-hidden />
              Les plannen
            </Link>
          </div>
        }
      />

      <Card className="border-primary/20 bg-primary-soft/35">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Reguliere les nodig?
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Een gewone rijles kies je niet in deze lijst, omdat dit scherm alleen agenda-afspraken en tijdsblokken beheert. Open daarvoor direct de lesplanner.
            </p>
          </div>
          <Link
            href="/instructor/les/nieuw"
            className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
          >
            Open lesplanner
          </Link>
        </CardContent>
      </Card>

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
    </PWAPage>
  );
}
