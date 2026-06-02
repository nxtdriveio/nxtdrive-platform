import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadTenantInstructors } from "@/lib/availability/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { SlotStudentSuggestions } from "@/components/agenda/slot-student-suggestions";
import {
  updateAppointment,
  deleteAppointment,
  setAppointmentResult,
} from "@/lib/agenda/actions";
import {
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_RESULT_LABEL,
  durationMinutes,
  isStudentLinkedType,
  isResultableType,
  type AgendaAppointment,
} from "@/lib/agenda/types";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

export default async function EditAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const { id } = await params;
  const sp = await searchParams;
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;
  const formPath = `/backoffice/agenda/afspraak/${id}`;

  const supabase = await createServerSupabaseClient();
  const { data: apptRaw } = await supabase
    .from("agenda_appointments")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
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

  const linked = isStudentLinkedType(appt!.type);

  return (
    <div className="space-y-6">
      <Link
        href="/backoffice/agenda"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar agenda
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Afspraak bewerken
        </h1>
        <p className="text-sm text-muted-foreground">
          {APPOINTMENT_TYPE_LABEL[appt!.type]}
        </p>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Bewerken mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      {linked && appt!.student_id ? (
        <Link
          href={`/backoffice/leerlingen/${appt!.student_id}`}
          className="inline-flex text-sm text-primary hover:underline"
        >
          Open leerlingdossier →
        </Link>
      ) : null}

      {appt!.type === "free_block" ? (
        <SlotStudentSuggestions
          tenantId={tenant.id}
          instructorId={appt!.instructor_id}
          startsAt={appt!.starts_at}
          durationMin={durationMinutes(appt!.starts_at, appt!.ends_at)}
          excludeAppointmentId={appt!.id}
        />
      ) : null}

      {isResultableType(appt!.type) ? (
        <Card>
          <CardHeader>
            <CardTitle>Uitslag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {appt!.result ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Vastgelegd: </span>
                <span className="font-medium text-foreground">
                  {APPOINTMENT_RESULT_LABEL[appt!.result]}
                </span>
                {appt!.result_note ? (
                  <p className="mt-1 text-muted-foreground">
                    {appt!.result_note}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nog geen uitslag vastgelegd.
              </p>
            )}
            <form action={setAppointmentResult} className="space-y-3">
              <input type="hidden" name="appointment_id" value={appt!.id} />
              <input type="hidden" name="redirect_to" value={formPath} />
              <input type="hidden" name="error_to" value={formPath} />
              <div className="space-y-1.5">
                <label
                  htmlFor="result"
                  className="text-sm font-medium text-foreground"
                >
                  Resultaat
                </label>
                <select
                  id="result"
                  name="result"
                  defaultValue={appt!.result ?? ""}
                  required
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Kies resultaat…
                  </option>
                  <option value="passed">Geslaagd</option>
                  <option value="failed">Gezakt</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="result_note"
                  className="text-sm font-medium text-foreground"
                >
                  Vervolgadvies <span className="text-muted-foreground">(optioneel)</span>
                </label>
                <textarea
                  id="result_note"
                  name="result_note"
                  rows={3}
                  maxLength={1000}
                  defaultValue={appt!.result_note ?? ""}
                  placeholder="Bijv. extra aandacht voor invoegen vóór herexamen."
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
              <Button type="submit">Uitslag opslaan</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Gegevens</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentForm
            action={updateAppointment}
            mode="edit"
            redirectTo="/backoffice/agenda"
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
            <input type="hidden" name="redirect_to" value="/backoffice/agenda" />
            <Button type="submit" variant="danger">
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
              Verwijderen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
