import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadTenantInstructors } from "@/lib/availability/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { ExamSignalsPanel } from "@/components/exam/exam-signals-panel";
import { loadExamSignals } from "@/lib/exam/data";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { updateAppointment, deleteAppointment } from "@/lib/agenda/actions";
import {
  APPOINTMENT_TYPE_LABEL,
  durationMinutes,
  type AgendaAppointment,
} from "@/lib/agenda/types";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

export default async function EditInstructorAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const { id } = await params;
  const sp = await searchParams;
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;
  const formPath = `/instructor/afspraak/${id}`;

  const supabase = await createServerSupabaseClient();
  let apptQuery = supabase
    .from("agenda_appointments")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id);
  // An instructor may only open their own appointments.
  if (!isAdmin) apptQuery = apptQuery.eq("instructor_id", user.id);
  const { data: apptRaw } = await apptQuery.maybeSingle();
  const appt = apptRaw as AgendaAppointment | null;
  if (!appt) notFound();

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

  const examSignals = await loadExamSignals(
    createServiceRoleClient(),
    tenant.id,
    appt!.id,
  );

  return (
    <PWAPage app="instructor" contentClassName="space-y-6">
      <PWAPageHeader
        eyebrow="Planning"
        title="Afspraak bewerken"
        description={APPOINTMENT_TYPE_LABEL[appt!.type]}
        align="left"
        actions={
          <Link
            href="/instructor/week"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Terug naar agenda
          </Link>
        }
      />

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Bewerken mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      {examSignals ? (
        <ExamSignalsPanel
          appointmentId={appt!.id}
          signals={examSignals.signals}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Gegevens</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentForm
            action={updateAppointment}
            mode="edit"
            redirectTo="/instructor/week"
            errorTo={formPath}
            appointmentId={appt!.id}
            instructors={instructors}
            ownInstructor={
              isAdmin
                ? undefined
                : { id: user.id, full_name: user.profile?.full_name ?? "Jij" }
            }
            students={students}
            defaults={{
              type: appt!.type,
              instructorId: appt!.instructor_id,
              studentId: appt!.student_id,
              date: appt!.starts_at.slice(0, 10),
              time: appt!.starts_at.slice(11, 16),
              durationMin: durationMinutes(appt!.starts_at, appt!.ends_at),
              title: appt!.title,
              location: appt!.location,
              notes: appt!.notes,
            }}
            submitLabel="Wijzigingen opslaan"
          />
        </CardContent>
      </Card>

      <Card className="border-danger/30">
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div className="text-sm text-muted-foreground">
            Verwijder deze afspraak definitief uit de agenda.
          </div>
          <form action={deleteAppointment}>
            <input type="hidden" name="appointment_id" value={appt!.id} />
            <input type="hidden" name="redirect_to" value="/instructor/week" />
            <Button type="submit" variant="danger">
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
              Verwijderen
            </Button>
          </form>
        </CardContent>
      </Card>
    </PWAPage>
  );
}
