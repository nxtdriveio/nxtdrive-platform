import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTaskLaunchData } from "@/lib/tasks/launch-data";
import { CreateTaskFromEntityButton } from "@/app/backoffice/taken/create-task-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
import {
  CREDIT_REASON_LABEL,
  formatTegoed,
  formatTegoedDelta,
  type CreditLedgerRow,
  type Student,
  type StudentBalance,
} from "@/lib/students/types";
import { formatEuros, type Package } from "@/lib/packages/types";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import { adjustCredits, grantPackageToStudent } from "../actions";
import { saveStudentDaypartPreference } from "@/lib/availability/actions";
import {
  STUDENT_DAYPARTS,
  STUDENT_DAYPART_LABEL,
} from "@/lib/availability/types";

export const dynamic = "force-dynamic";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin = roles.includes("tenant_admin");

  const supabase = await createServerSupabaseClient();

  const { data: studentRaw } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!studentRaw) notFound();
  const student = studentRaw as Student;

  const taskLaunch = await loadTaskLaunchData(
    createServiceRoleClient(),
    tenant.id,
  );

  const { data: ledgerRaw } = await supabase
    .from("credit_ledger")
    .select(
      "id, tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id, created_at",
    )
    .eq("student_id", id)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const ledger = (ledgerRaw ?? []) as CreditLedgerRow[];

  const { data: balanceRaw } = await supabase
    .from("student_credit_balance")
    .select("student_id, tenant_id, balance")
    .eq("student_id", id)
    .maybeSingle();
  const balance = ((balanceRaw as StudentBalance | null)?.balance ?? 0) as number;

  const { data: packagesRaw } = await supabase
    .from("packages")
    .select("id, name, credits_total, price_cents, active")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("credits_total", { ascending: true });
  const activePackages = (packagesRaw ?? []) as Pick<
    Package,
    "id" | "name" | "credits_total" | "price_cents" | "active"
  >[];

  const { data: upcomingRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("student_id", id)
    .eq("tenant_id", tenant.id)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(5);
  const upcomingLessons = (upcomingRaw ?? []) as Lesson[];

  return (
    <div className="space-y-6">
      <Link
        href="/backoffice/leerlingen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar leerlingen
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {student.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Leerling sinds {dtFmt.format(new Date(student.created_at))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateTaskFromEntityButton
            entityType="student"
            entityId={student.id}
            entityLabel={student.full_name}
            boards={taskLaunch.boards}
            members={taskLaunch.members}
          />
          <Badge
            variant={
              balance > 300 ? "success" : balance > 0 ? "warning" : "danger"
            }
          >
            Saldo: {formatTegoed(balance)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Contactgegevens</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <Field label="E-mail" value={student.email} />
                <Field label="Telefoon" value={student.phone} />
                <Field label="Postcode" value={student.postcode} />
                <Field
                  label="Login gekoppeld"
                  value={student.user_id ? "Ja" : "Nee"}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Komende lessen</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingLessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen geplande lessen.{" "}
                  <Link
                    href={`/backoffice/agenda/nieuw?student_id=${student.id}`}
                    className="text-primary hover:underline"
                  >
                    Plan er één →
                  </Link>
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {upcomingLessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <Link
                        href={`/backoffice/agenda/${l.id}`}
                        className="flex-1 text-sm hover:underline"
                      >
                        <div className="font-medium text-foreground">
                          {dtFmt.format(new Date(l.starts_at))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {l.location ?? "—"} · {formatTegoed(l.credits_cost)}
                        </div>
                      </Link>
                      <Badge variant={LESSON_STATUS_VARIANT[l.status]}>
                        {LESSON_STATUS_LABEL[l.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tegoed-historie (uren)</CardTitle>
            </CardHeader>
            <CardContent>
              {ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen tegoed-mutaties.
                </p>
              ) : (
                <ol className="divide-y divide-border">
                  {ledger.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {CREDIT_REASON_LABEL[row.reason]}
                        </div>
                        {row.note ? (
                          <div className="text-xs text-muted-foreground">
                            {row.note}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {dtFmt.format(new Date(row.created_at))}
                        </div>
                      </div>
                      <span
                        className={
                          row.delta >= 0
                            ? "text-success font-semibold"
                            : "text-danger font-semibold"
                        }
                      >
                        {formatTegoedDelta(row.delta)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Pakket toekennen</CardTitle>
              </CardHeader>
              <CardContent>
                {activePackages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Geen actieve pakketten.{" "}
                    <Link
                      href="/backoffice/packages"
                      className="text-primary hover:underline"
                    >
                      Maak er eerst één aan.
                    </Link>
                  </p>
                ) : (
                  <form action={grantPackageToStudent} className="space-y-3">
                    <input type="hidden" name="student_id" value={student.id} />
                    <Select name="package_id" defaultValue={activePackages[0]!.id}>
                      {activePackages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatTegoed(p.credits_total)} ·{" "}
                          {formatEuros(p.price_cents)}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" size="sm" className="w-full">
                      Toekennen
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Handmatige correctie</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={adjustCredits} className="space-y-3">
                  <input type="hidden" name="student_id" value={student.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="delta">Aantal uren (+ of -)</Label>
                    <Input
                      id="delta"
                      name="delta"
                      type="number"
                      step="0.25"
                      required
                      placeholder="-1 of +5"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="note">Reden</Label>
                    <Input
                      id="note"
                      name="note"
                      required
                      maxLength={200}
                      placeholder="bv. Compensatie geannuleerde les"
                    />
                  </div>
                  <Button type="submit" size="sm" className="w-full">
                    Correctie boeken
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Voorkeur dagdelen</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={saveStudentDaypartPreference}
                  className="space-y-3"
                >
                  <input type="hidden" name="student_id" value={student.id} />
                  <div className="space-y-2">
                    {STUDENT_DAYPARTS.map((d) => (
                      <label
                        key={d}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          name={`daypart_${d}`}
                          defaultChecked={
                            student.preferred_dayparts?.includes(d) ?? false
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                        {STUDENT_DAYPART_LABEL[d]}
                      </label>
                    ))}
                  </div>
                  <Button type="submit" size="sm" className="w-full">
                    Voorkeur opslaan
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
