import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, GraduationCap, Gauge } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadInstructorAccessibleStudentIds } from "@/lib/students/access";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  INTAKE_PACE_LABEL,
  INTAKE_STATUS_LABEL,
  INTAKE_TRANSMISSION_LABEL,
  type LeadIntakeDetail,
} from "@/lib/leads/types";
import type { Student } from "@/lib/students/types";
import {
  PWACard,
  PWAEmptyState,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function InstructorIntakePage() {
  const { user, tenant, roles } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const isAdmin = roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  const accessibleStudentIds = isAdmin
    ? null
    : await loadInstructorAccessibleStudentIds(service, tenant.id, user.id);

  let studentsQuery = supabase
    .from("students")
    .select("id, lead_id, full_name, email, phone")
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
    "id" | "lead_id" | "full_name" | "email" | "phone"
  >[];

  const leadIds = Array.from(
    new Set(
      students
        .map((student) => student.lead_id)
        .filter((leadId): leadId is string => Boolean(leadId)),
    ),
  );

  const { data: intakeRaw } = leadIds.length
    ? await supabase
        .from("lead_intake_details")
        .select("*")
        .eq("tenant_id", tenant.id)
        .in("lead_id", leadIds)
    : { data: [] };
  const intakeByLeadId = new Map(
    ((intakeRaw ?? []) as LeadIntakeDetail[]).map((intake) => [intake.lead_id, intake]),
  );

  const withIntake = students.filter((student) => student.lead_id && intakeByLeadId.has(student.lead_id));
  const theoryMissing = withIntake.filter((student) => {
    const intake = intakeByLeadId.get(student.lead_id!);
    return intake && intake.theory_status !== "yes";
  }).length;
  const startPending = withIntake.filter((student) => {
    const intake = intakeByLeadId.get(student.lead_id!);
    return !intake?.desired_start_date;
  }).length;

  return (
    <PWAPage app="instructor" contentClassName="space-y-5 xl:space-y-6">
      <PWAPageHeader
        eyebrow="Intake"
        title="Intakeoverzicht"
        description="Bekijk per leerling de intakecontext zonder je instructeurapp te verlaten. Open daarna direct het leerlingdossier voor planning of opvolging."
        align="left"
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Met intake"
          value={withIntake.length}
          hint="Leerlingen met intakegegevens in jouw context."
          info="Alle leerlingen uit jouw instructeurcontext waarvoor al intake-informatie beschikbaar is."
        />
        <PWAKpiTile
          label="Theorie open"
          value={theoryMissing}
          hint="Intakes waar theorie nog niet rond is."
          info="Geeft aan bij hoeveel intakeprofielen theorie of voorbereiding nog opvolging vraagt."
        />
        <PWAKpiTile
          label="Startdatum open"
          value={startPending}
          hint="Nog geen gewenste startdatum geregistreerd."
          info="Handig om snel te zien waar je nog ritme of planning moet afstemmen."
        />
      </PWAKpiGrid>

      {withIntake.length === 0 ? (
        <PWAEmptyState message="Nog geen intakegegevens beschikbaar binnen jouw instructeurcontext." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {withIntake.map((student) => {
            const intake = intakeByLeadId.get(student.lead_id!);
            if (!intake) return null;

            return (
              <PWACard
                key={student.id}
                title={<span className="truncate">{student.full_name}</span>}
                className="bg-card"
                contentClassName="space-y-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background px-3.5 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Gewenste start
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {intake.desired_start_date
                        ? dateFmt.format(new Date(intake.desired_start_date))
                        : "Nog niet ingevuld"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background px-3.5 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Transmissie
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {intake.transmission
                        ? INTAKE_TRANSMISSION_LABEL[intake.transmission]
                        : "Niet opgegeven"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                      Theorie
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {INTAKE_STATUS_LABEL[intake.theory_status]}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" aria-hidden />
                      Gezondheidsverklaring
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {INTAKE_STATUS_LABEL[intake.health_declaration_status]}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" aria-hidden />
                      Tempo
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {intake.pace ? INTAKE_PACE_LABEL[intake.pace] : "Niet opgegeven"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background px-3.5 py-3">
                  <div className="flex items-start gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Ophaal- en lescontext</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {intake.pickup_location || "Nog geen specifieke ophaallocatie ingevuld."}
                      </p>
                      {intake.remarks ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {intake.remarks}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <Link
                  href={`/instructor/leerlingen/${student.id}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/80"
                >
                  Open leerlingcontext
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </PWACard>
            );
          })}
        </div>
      )}
    </PWAPage>
  );
}
