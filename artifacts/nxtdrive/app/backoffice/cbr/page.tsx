import type { ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  ClipboardCheck,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  loadTenantCbrOverview,
  type CbrOverviewRow,
} from "@/lib/cbr/data";
import {
  CBR_EXAM_STATUS_LABEL,
  CBR_EXAM_STATUS_TONE,
  type CbrStatusTone,
} from "@/lib/cbr/derive";
import { MACHTIGING_STATUS_LABEL } from "@/lib/cbr/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TONE_VARIANT: Record<
  CbrStatusTone,
  "default" | "info" | "warning" | "success" | "danger"
> = {
  neutral: "default",
  info: "info",
  warning: "warning",
  success: "success",
  danger: "danger",
};

function hasExamPreconditions(row: CbrOverviewRow): boolean {
  return (
    row.preconditions.theorieBehaald &&
    row.preconditions.machtigingGeregeld &&
    (!row.preconditions.gezondheidsverklaringVereist ||
      row.preconditions.gezondheidsverklaringGeregeld)
  );
}

function missingPreconditionLabels(row: CbrOverviewRow): string[] {
  const missing: string[] = [];
  if (!row.preconditions.theorieBehaald) missing.push("Theorie ontbreekt");
  if (!row.preconditions.machtigingGeregeld) missing.push("Machtiging open");
  if (
    row.preconditions.gezondheidsverklaringVereist &&
    !row.preconditions.gezondheidsverklaringGeregeld
  ) {
    missing.push("Gezondheidsverklaring open");
  }
  return missing;
}

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card className="border-border/80 bg-card/70">
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function CbrOverviewPage() {
  const context = await requireOrganizationPermission("student:read", {
    allowedRoles: [...STUDENT_BACKOFFICE_READ_ROLES],
  });
  const { organization: tenant } = context;
  const supabase = await createServerSupabaseClient();
  const branchScope = await loadOrganizationBranchScope(supabase, context);
  const rows = await loadTenantCbrOverview(supabase, tenant.id, new Date(), {
    branchScope,
  });

  const readyRows = rows.filter(
    (row) => hasExamPreconditions(row) && row.derived.examStatus !== "geslaagd",
  );
  const blockedRows = rows.filter(
    (row) => missingPreconditionLabels(row).length > 0,
  );
  const replanRows = rows.filter(
    (row) =>
      row.derived.examStatus === "gezakt" ||
      row.derived.examStatus === "niet_verschenen",
  );
  const upcomingRows = [...rows]
    .filter((row) => row.derived.nextAppointmentAt)
    .sort(
      (left, right) =>
        Date.parse(left.derived.nextAppointmentAt ?? "") -
        Date.parse(right.derived.nextAppointmentAt ?? ""),
    );
  const upcomingNext14Days = upcomingRows.filter((row) => {
    const at = row.derived.nextAppointmentAt;
    if (!at) return false;
    const diff = Date.parse(at) - Date.now();
    return diff >= 0 && diff <= 14 * 24 * 60 * 60 * 1000;
  });
  const attentionRows = [...blockedRows, ...replanRows].slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
            Examenregie
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              CBR-status
            </h1>
            <p className="text-sm text-muted-foreground">
              Machtiging, theorie, gezondheidsverklaring en examenritme van{" "}
              {tenant.name} in een centrale opvolglaag voor backoffice en
              planning.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/backoffice/leerlingen"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Leerlingenoverzicht
          </Link>
          <Link
            href="/backoffice/agenda"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Agenda openen
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Examenklaar"
          value={String(readyRows.length)}
          hint="Leerlingen met complete randvoorwaarden."
          icon={ShieldCheck}
        />
        <SummaryCard
          label="Blokkades"
          value={String(blockedRows.length)}
          hint="Open machtiging, theorie of gezondheidsverklaring."
          icon={ShieldAlert}
        />
        <SummaryCard
          label="Binnen 14 dagen"
          value={String(upcomingNext14Days.length)}
          hint="Toetsen of examens die snel aandacht vragen."
          icon={CalendarClock}
        />
        <SummaryCard
          label="Herplanning nodig"
          value={String(replanRows.length)}
          hint="Gezakt of niet verschenen zonder frisse follow-up."
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Directe opvolging</CardTitle>
            <p className="text-sm text-muted-foreground">
              Leerlingen waar administratie of planning eerst op moet ingrijpen.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Geen acute CBR-blokkades. Dit overzicht blijft hier live
                meebewegen zodra een leerling vastloopt of herplanning nodig
                heeft.
              </div>
            ) : (
              attentionRows.map((row) => {
                const missing = missingPreconditionLabels(row);
                const needsReplan =
                  row.derived.examStatus === "gezakt" ||
                  row.derived.examStatus === "niet_verschenen";
                return (
                  <div
                    key={row.studentId}
                    className="rounded-xl border border-border bg-muted/20 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Link
                          href={`/backoffice/leerlingen/${row.studentId}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          {needsReplan ? (
                            <Badge variant="danger">Herplanning nodig</Badge>
                          ) : null}
                          {missing.map((item) => (
                            <Badge key={item} variant="warning">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge
                        variant={
                          TONE_VARIANT[
                            CBR_EXAM_STATUS_TONE[row.derived.examStatus]
                          ]
                        }
                      >
                        {CBR_EXAM_STATUS_LABEL[row.derived.examStatus]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {row.lastExamNote
                        ? row.lastExamNote
                        : needsReplan
                          ? "Laatste examenafspraak vraagt een nieuw vervolg in agenda en dossier."
                          : "Rond eerst de ontbrekende randvoorwaarden af voordat het examenproces verdergaat."}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">
              Binnenkort op de planning
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              De eerstvolgende toetsen en examens, zodat planners en
              administratie vooruit kunnen werken.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Er staan nog geen toets- of examenafspraken gepland binnen je
                zichtbare scope.
              </div>
            ) : (
              upcomingRows.slice(0, 6).map((row) => (
                <div
                  key={row.studentId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-4"
                >
                  <div className="space-y-1">
                    <Link
                      href={`/backoffice/leerlingen/${row.studentId}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {row.fullName}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {row.derived.nextAppointmentType === "exam"
                        ? "Praktijkexamen"
                        : "Tussentijdse toets"}{" "}
                      gepland op{" "}
                      {row.derived.nextAppointmentAt
                        ? dateFmt.format(new Date(row.derived.nextAppointmentAt))
                        : "-"}
                    </p>
                  </div>
                  <Badge variant="info">
                    {CBR_EXAM_STATUS_LABEL[row.derived.examStatus]}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20">
          <CardTitle className="text-foreground">
            Alle leerlingen in CBR-context
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Detailtabel voor machtiging, theorie, gezondheidsverklaring en
            laatste examenuitkomst.
          </p>
        </CardHeader>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nog geen actieve leerlingen binnen je toegestane vestigingen.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Naam</th>
                  <th className="px-4 py-3 font-medium">Examenstatus</th>
                  <th className="px-4 py-3 font-medium">Machtiging</th>
                  <th className="px-4 py-3 font-medium">Theorie</th>
                  <th className="px-4 py-3 font-medium">
                    Gezondheidsverklaring
                  </th>
                  <th className="px-4 py-3 font-medium">Laatste uitslag</th>
                  <th className="px-4 py-3 font-medium">Eerstvolgende</th>
                  <th className="px-4 py-3 font-medium">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const gv = row.preconditions.gezondheidsverklaringVereist
                    ? row.preconditions.gezondheidsverklaringGeregeld
                      ? "Geregeld"
                      : "Open"
                    : "Niet van toepassing";
                  return (
                    <tr key={row.studentId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/backoffice/leerlingen/${row.studentId}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {row.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            TONE_VARIANT[
                              CBR_EXAM_STATUS_TONE[row.derived.examStatus]
                            ]
                          }
                        >
                          {CBR_EXAM_STATUS_LABEL[row.derived.examStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            row.preconditions.machtigingStatus === "ontvangen"
                              ? "success"
                              : row.preconditions.machtigingStatus ===
                                  "aangevraagd"
                                ? "warning"
                                : "default"
                          }
                        >
                          {
                            MACHTIGING_STATUS_LABEL[
                              row.preconditions.machtigingStatus
                            ]
                          }
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.preconditions.theorieBehaald ? "Behaald" : "Open"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{gv}</td>
                      <td className="px-4 py-3">
                        {row.derived.lastExamResult ? (
                          <Badge
                            variant={
                              row.derived.lastExamResult === "passed"
                                ? "success"
                                : "danger"
                            }
                          >
                            {row.derived.lastExamResult === "passed"
                              ? "Geslaagd"
                              : row.derived.lastExamResult === "failed"
                                ? "Gezakt"
                                : "Niet verschenen"}
                            {row.derived.lastExamAt
                              ? ` - ${dateFmt.format(
                                  new Date(row.derived.lastExamAt),
                                )}`
                              : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {row.derived.nextAppointmentAt
                          ? dateFmt.format(new Date(row.derived.nextAppointmentAt))
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/backoffice/leerlingen/${row.studentId}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          Dossier
                          <ArrowUpRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
