import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { formatTegoed, type Student, type StudentBalance } from "@/lib/students/types";
import { loadTenantInstructors } from "@/lib/availability/service";
import { loadInstructorAccessibleStudentIds } from "@/lib/students/access";
import { scheduleLesson } from "@/app/backoffice/agenda/actions";
import { LessonLocationField } from "@/app/backoffice/agenda/nieuw/location-field";

export const dynamic = "force-dynamic";

type Instructor = { id: string; full_name: string | null };

export default async function NewInstructorLessonPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    student_id?: string;
    date?: string;
    time?: string;
    duration_min?: string;
  }>;
}) {
  const sp = await searchParams;
  const { user, tenant, roles } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const isAdmin = roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  const instructors: Instructor[] = isAdmin
    ? await loadTenantInstructors(tenant.id)
    : [{ id: user.id, full_name: user.profile?.full_name ?? "Jij" }];

  const accessibleStudentIds = isAdmin
    ? null
    : await loadInstructorAccessibleStudentIds(service, tenant.id, user.id);

  let studentsQuery = supabase
    .from("students")
    .select("id, tenant_id, branch_id, full_name")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("full_name", { ascending: true });
  if (accessibleStudentIds) {
    studentsQuery =
      accessibleStudentIds.length > 0
        ? studentsQuery.in("id", accessibleStudentIds)
        : studentsQuery.in("id", ["__none__"]);
  }
  const { data: studentsRaw } = await studentsQuery;
  const students = (studentsRaw ?? []) as Pick<
    Student,
    "id" | "tenant_id" | "branch_id" | "full_name"
  >[];

  const studentIds = students.map((student) => student.id);
  const { data: balancesRaw } = studentIds.length
    ? await supabase
        .from("student_credit_balance")
        .select("student_id, balance")
        .eq("tenant_id", tenant.id)
        .in("student_id", studentIds)
    : { data: [] };
  const balanceMap = new Map(
    ((balancesRaw ?? []) as StudentBalance[]).map((balance) => [
      balance.student_id,
      balance.balance,
    ]),
  );

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "")
    ? sp.date!
    : now.toISOString().slice(0, 10);
  const defaultTime = /^\d{2}:\d{2}$/.test(sp.time ?? "")
    ? sp.time!
    : now.toISOString().slice(11, 16);
  const durationOptions = ["45", "60", "90", "120"];
  const defaultDuration = durationOptions.includes(sp.duration_min ?? "")
    ? sp.duration_min!
    : "60";
  const defaultStudentId =
    sp.student_id && students.some((student) => student.id === sp.student_id)
      ? sp.student_id
      : (students[0]?.id ?? "");

  return (
    <PWAPage app="instructor" contentClassName="space-y-5 xl:space-y-6">
      <PWAPageHeader
        eyebrow="Planning"
        title="Nieuwe les"
        description="Plan hier direct een reguliere rijles vanuit je instructeurapp. Alles blijft binnen je eigen cockpit en leidt meteen naar de lesdetailpagina."
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
          Inplannen mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      {instructors.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Er zijn geen instructeurs beschikbaar binnen deze instructeurcontext.
        </Card>
      ) : students.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Je hebt nog geen leerlingen binnen je eigen lescontext om direct voor te plannen.
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Les inplannen</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={scheduleLesson} className="space-y-4">
              <input type="hidden" name="redirect_to" value="/instructor/week" />
              <input type="hidden" name="error_to" value="/instructor/les/nieuw" />
              <input type="hidden" name="detail_base" value="/instructor" />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="instructor_id">Instructeur</Label>
                  {isAdmin ? (
                    <Select id="instructor_id" name="instructor_id" defaultValue={user.id} required>
                      {instructors.map((instructor) => (
                        <option key={instructor.id} value={instructor.id}>
                          {instructor.full_name ?? "Instructeur"}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <>
                      <input type="hidden" name="instructor_id" value={user.id} />
                      <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                        {user.profile?.full_name ?? "Jij"}
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="student_id">Leerling</Label>
                  <Select id="student_id" name="student_id" defaultValue={defaultStudentId} required>
                    {students.map((student) => {
                      const balance = balanceMap.get(student.id) ?? 0;
                      return (
                        <option key={student.id} value={student.id}>
                          {student.full_name} - saldo: {formatTegoed(balance)}
                        </option>
                      );
                    })}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="date">Datum</Label>
                  <Input id="date" name="date" type="date" required defaultValue={defaultDate} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="time">Starttijd</Label>
                  <Input id="time" name="time" type="time" required defaultValue={defaultTime} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="duration_min">Duur (minuten)</Label>
                  <Select id="duration_min" name="duration_min" defaultValue={defaultDuration}>
                    {durationOptions.map((duration) => (
                      <option key={duration} value={duration}>
                        {duration}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Het tegoed wordt automatisch met de lesduur verrekend.
                  </p>
                </div>
              </div>

              <LessonLocationField />

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notities</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  maxLength={1000}
                  placeholder="Optioneel"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Link href="/instructor/week" className={buttonVariants({ variant: "ghost" })}>
                  Annuleren
                </Link>
                <Button type="submit">Les inplannen</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </PWAPage>
  );
}
