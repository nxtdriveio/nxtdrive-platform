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
import type { Student, StudentBalance } from "@/lib/students/types";
import { scheduleLesson } from "../actions";

export const dynamic = "force-dynamic";

type Instructor = { id: string; full_name: string | null };

export default async function NewLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; student_id?: string }>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const sp = await searchParams;

  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  // Instructors = users in this tenant with instructor or tenant_admin role.
  const { data: membershipsRaw } = await service
    .from("memberships")
    .select("user_id, role")
    .eq("tenant_id", tenant.id)
    .in("role", ["instructor", "tenant_admin"]);
  const instructorIds = Array.from(
    new Set((membershipsRaw ?? []).map((m) => m.user_id as string)),
  );
  const { data: profilesRaw } = instructorIds.length
    ? await service
        .from("profiles")
        .select("id, full_name")
        .in("id", instructorIds)
    : { data: [] };
  const instructors = (profilesRaw ?? []) as Instructor[];

  // Students with balance for selection.
  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, tenant_id, full_name")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("full_name", { ascending: true });
  const students = (studentsRaw ?? []) as Pick<
    Student,
    "id" | "tenant_id" | "full_name"
  >[];

  const { data: balancesRaw } = await supabase
    .from("student_credit_balance")
    .select("student_id, balance")
    .eq("tenant_id", tenant.id);
  const balanceMap = new Map(
    ((balancesRaw ?? []) as StudentBalance[]).map((b) => [
      b.student_id,
      b.balance,
    ]),
  );

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const defaultDate = now.toISOString().slice(0, 10);
  const defaultTime = now.toISOString().slice(11, 16);

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
          Les plannen
        </h1>
        <p className="text-sm text-muted-foreground">
          Trekt direct credits af bij de leerling.
        </p>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Inplannen mislukt: {decodeURIComponent(sp.error)}
        </Card>
      ) : null}

      {instructors.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Er zijn nog geen instructeurs gekoppeld aan deze tenant. Voeg er één
          toe via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            db:add-membership
          </code>
          .
        </Card>
      ) : students.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Geen leerlingen om in te plannen.{" "}
          <Link
            href="/backoffice/leads"
            className="text-primary hover:underline"
          >
            Converteer eerst een lead →
          </Link>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe les</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={scheduleLesson} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="instructor_id">Instructeur</Label>
                  <Select
                    id="instructor_id"
                    name="instructor_id"
                    defaultValue={instructors[0]?.id ?? ""}
                    required
                  >
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name ?? "Instructeur"}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="student_id">Leerling</Label>
                  <Select
                    id="student_id"
                    name="student_id"
                    defaultValue={sp.student_id ?? students[0]!.id}
                    required
                  >
                    {students.map((s) => {
                      const bal = balanceMap.get(s.id) ?? 0;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.full_name} — saldo: {bal}
                        </option>
                      );
                    })}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    required
                    defaultValue={defaultDate}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="time">Starttijd</Label>
                  <Input
                    id="time"
                    name="time"
                    type="time"
                    required
                    defaultValue={defaultTime}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="duration_min">Duur (minuten)</Label>
                  <Select
                    id="duration_min"
                    name="duration_min"
                    defaultValue="60"
                  >
                    <option value="45">45</option>
                    <option value="60">60</option>
                    <option value="90">90</option>
                    <option value="120">120</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="credits_cost">Credits</Label>
                  <Input
                    id="credits_cost"
                    name="credits_cost"
                    type="number"
                    min={1}
                    required
                    defaultValue={1}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="location">Locatie</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="bv. Station Amersfoort"
                  maxLength={200}
                />
              </div>

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
                <Link
                  href="/backoffice/agenda"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Annuleren
                </Link>
                <Button type="submit">Les inplannen</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
