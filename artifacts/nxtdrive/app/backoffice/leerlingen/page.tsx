import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  GraduationCap,
  MapPin,
  Plus,
  Wallet,
} from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatTegoed,
  type Student,
  type StudentBalance,
} from "@/lib/students/types";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { StudentsBranchFilter } from "@/components/students/StudentsBranchFilter";
import { listBranches } from "@/lib/branches/service";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireOrganizationPermission("student:read", {
    allowedRoles: [...STUDENT_BACKOFFICE_READ_ROLES],
  });
  const { organization: tenant, roles } = context;
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  const sp = searchParams ? await searchParams : {};
  const selectedBranchId =
    typeof sp.branch === "string" && sp.branch !== "" ? sp.branch : null;
  const canCreateStudents =
    context.user.profile?.is_platform_admin || roles.includes("tenant_admin");

  const [branchScope, allBranches] = await Promise.all([
    loadOrganizationBranchScope(service, context),
    listBranches(service, tenant.id, { activeOnly: true }),
  ]);

  const branchOptions =
    branchScope.scope_type === "all"
      ? allBranches
      : allBranches.filter((branch) => branchScope.branch_ids.includes(branch.id));
  const selectedBranch = selectedBranchId
    ? branchOptions.find((branch) => branch.id === selectedBranchId) ?? null
    : null;
  const hasInvalidBranchFilter = Boolean(selectedBranchId && !selectedBranch);
  const effectiveBranchId = selectedBranch?.id ?? null;
  const canQueryStudents =
    !hasInvalidBranchFilter &&
    (branchScope.scope_type === "all" || branchScope.branch_ids.length > 0);

  let students: Student[] = [];
  if (canQueryStudents) {
    let studentsQuery = supabase
      .from("students")
      .select(
        "id, tenant_id, branch_id, user_id, lead_id, full_name, email, phone, postcode, notes, active, created_at, updated_at",
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (effectiveBranchId) {
      studentsQuery = studentsQuery.eq("branch_id", effectiveBranchId);
    } else if (branchScope.scope_type === "branches") {
      studentsQuery = studentsQuery.in("branch_id", branchScope.branch_ids);
    }

    const { data: studentsRaw } = await studentsQuery;
    students = (studentsRaw ?? []) as Student[];
  }

  let balances: StudentBalance[] = [];
  if (students.length > 0) {
    const { data: balancesRaw } = await supabase
      .from("student_credit_balance")
      .select("student_id, tenant_id, balance")
      .eq("tenant_id", tenant.id)
      .in(
        "student_id",
        students.map((student) => student.id),
      );
    balances = (balancesRaw ?? []) as StudentBalance[];
  }

  const balanceMap = new Map(balances.map((balance) => [balance.student_id, balance.balance]));
  const branchNameMap = new Map(allBranches.map((branch) => [branch.id, branch.name]));
  const selectedBranchName = selectedBranch?.name;
  const emptyMessage = hasInvalidBranchFilter
    ? "Deze vestiging is niet beschikbaar binnen jouw toegang."
    : branchScope.scope_type === "branches" && branchOptions.length === 0
      ? "Je bent nog niet gekoppeld aan een vestiging met leerlingtoegang."
      : selectedBranchId
        ? "Geen leerlingen gevonden voor deze vestiging."
        : "Nog geen leerlingen. Converteer een lead of voeg er direct een toe.";

  const activeStudents = students.filter((student) => student.active).length;
  const studentsWithBalance = students.filter(
    (student) => (balanceMap.get(student.id) ?? 0) > 0,
  ).length;
  const studentsNeedingRefill = students.filter(
    (student) => (balanceMap.get(student.id) ?? 0) <= 60,
  ).length;
  const newestStudent = students[0] ?? null;
  const scopeLabel =
    branchScope.scope_type === "all"
      ? "Organisatiebreed inzicht"
      : `${branchOptions.length} vestiging${branchOptions.length === 1 ? "" : "en"} in scope`;
  const scopeDescription =
    branchScope.scope_type === "all"
      ? "Je bekijkt leerlingen over alle actieve vestigingen heen."
      : branchOptions.length === 0
        ? "Er is nog geen vestiging gekoppeld aan jouw leerlingtoegang."
        : "Je ziet alleen leerlingen binnen jouw toegestane vestigingen.";

  const statCards = [
    {
      title: "Actieve dossiers",
      value: activeStudents.toLocaleString("nl-NL"),
      description: "leerlingen die nu actief gevolgd worden",
      icon: GraduationCap,
    },
    {
      title: "Met rijtegoed",
      value: studentsWithBalance.toLocaleString("nl-NL"),
      description: "leerlingen met nog inzetbare lessen",
      icon: Wallet,
    },
    {
      title: "Opvolging nodig",
      value: studentsNeedingRefill.toLocaleString("nl-NL"),
      description: "dossiers met weinig of geen tegoed",
      icon: CalendarDays,
    },
    {
      title: "Vestigingenscope",
      value: branchScope.scope_type === "all" ? "Alle" : String(branchOptions.length),
      description:
        branchScope.scope_type === "all"
          ? "alle vestigingen zichtbaar"
          : "vestigingen met leerlingtoegang",
      icon: MapPin,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--primary)_10%,transparent))] p-5 shadow-[0_24px_80px_rgba(6,12,24,0.22)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/90">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden />
              Leerlingenbeheer
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Leerlingen
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Alle leerlingdossiers van {tenant.name}, inclusief tegoed,
                branchescope en snelle doorstroom naar planning en opvolging.
                {selectedBranchName ? (
                  <span className="ml-1 font-medium text-primary">
                    Huidige filter: {selectedBranchName}.
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {branchOptions.length > 0 ? (
              <StudentsBranchFilter
                branchOptions={branchOptions}
                selectedBranchId={selectedBranchId}
              />
            ) : null}
            {canCreateStudents ? <AddStudentDialog /> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>{card.title}</CardTitle>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                    {card.value}
                  </p>
                </div>
                <span className="rounded-full bg-primary-soft p-2 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Scope & opvolging</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Zichtbaarheid
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">{scopeLabel}</p>
              <p className="mt-2 text-sm text-muted-foreground">{scopeDescription}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Nieuwste dossier
              </p>
              {newestStudent ? (
                <>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {newestStudent.full_name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sinds {dateFmt.format(new Date(newestStudent.created_at))}
                  </p>
                  <Link
                    href={`/backoffice/leerlingen/${newestStudent.id}`}
                    className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
                  >
                    Dossier openen
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Er is nog geen leerlingdossier om direct te openen.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Snelle routes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Link
              href="/backoffice/agenda"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">Planning openen</p>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Plan vervolglessen direct vanuit de agenda of lesstroom.
              </p>
            </Link>
            <Link
              href="/backoffice/boekhouding"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">Boekhouding</p>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Bekijk saldo, facturen en opvolging voor leerlingen met weinig tegoed.
              </p>
            </Link>
            {canCreateStudents ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Plus className="h-4 w-4 text-primary" aria-hidden />
                  <p className="font-medium">Nieuwe leerling toevoegen</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Maak direct een dossier aan wanneer een lead al is omgezet.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {students.length === 0 ? (
        <Card className="overflow-hidden">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {students.map((student) => {
              const balance = balanceMap.get(student.id) ?? 0;
              const branchName = student.branch_id
                ? branchNameMap.get(student.branch_id) ?? "Vestiging onbekend"
                : "Niet gekoppeld";
              return (
                <Card key={student.id}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Link
                          href={`/backoffice/leerlingen/${student.id}`}
                          className="text-base font-semibold text-foreground hover:underline"
                        >
                          {student.full_name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {student.email ?? student.phone ?? "Geen contactgegeven"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          balance > 300 ? "success" : balance > 0 ? "warning" : "danger"
                        }
                      >
                        {formatTegoed(balance)}
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Vestiging
                        </p>
                        <p className="mt-1 text-sm text-foreground">{branchName}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Sinds
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {dateFmt.format(new Date(student.created_at))}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/backoffice/leerlingen/${student.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Dossier openen
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Vestiging</th>
                    <th className="px-4 py-3 font-medium">Saldo</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Postcode</th>
                    <th className="px-4 py-3 font-medium">Sinds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((student) => {
                    const balance = balanceMap.get(student.id) ?? 0;
                    return (
                      <tr key={student.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <Link
                            href={`/backoffice/leerlingen/${student.id}`}
                            className="hover:underline"
                          >
                            {student.full_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {student.branch_id
                            ? branchNameMap.get(student.branch_id) ?? "Vestiging onbekend"
                            : "Niet gekoppeld"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              balance > 300
                                ? "success"
                                : balance > 0
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {formatTegoed(balance)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {student.email ?? student.phone ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {student.postcode ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {dateFmt.format(new Date(student.created_at))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
