import { redirect } from "next/navigation";
import { BadgeCheck, CalendarClock, ShieldCheck } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PWAPage, PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";
import { getActiveStudent } from "@/lib/students/access";
import { loadStudentCbrSummary } from "@/lib/cbr/data";
import { loadStudentExamPrep } from "@/lib/exam/data";
import type { StudentBalance } from "@/lib/students/types";
import {
  StudentChecklist,
  StudentProgressBar,
  StudentRing,
  StudentShowcaseCard,
} from "@/components/student/Showcase";
import { StudentExamResultCard } from "@/components/student/StudentExamResultCard";
import { ExamPrepCard } from "@/components/student/ExamPrepCard";
import { createNlDateTimeFormatter, resolveTenantTimeZone } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function createStudentCbrFormatters(timeZone: string) {
  return {
    dateFmt: createNlDateTimeFormatter(
      {
        weekday: "long",
        day: "numeric",
        month: "long",
      },
      timeZone,
    ),
  };
}

export default async function StudentCbrPage() {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { dateFmt } = createStudentCbrFormatters(resolveTenantTimeZone(tenant));
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/student/select-child");
  if (!student) {
    return <PWAEmptyState message="Je account is nog niet gekoppeld aan een leerlingdossier." />;
  }

  const supabase = await createServerSupabaseClient();
  const [cbrSummary, balanceRes] = await Promise.all([
    loadStudentCbrSummary(supabase, tenant.id, student.id),
    supabase
      .from("student_credit_balance")
      .select("student_id, balance")
      .eq("student_id", student.id)
      .maybeSingle(),
  ]);
  const balance = ((balanceRes.data as StudentBalance | null)?.balance ?? 0) as number;

  const examPrep =
    cbrSummary.derived.examStatus === "examen_gepland" ||
    cbrSummary.derived.examStatus === "toets_gepland"
      ? await loadStudentExamPrep(supabase, tenant.id, student.id)
      : null;

  const readinessPct =
    (cbrSummary.preconditions.theorieBehaald ? 34 : 0) +
    (cbrSummary.preconditions.machtigingStatus === "ontvangen" ? 33 : 0) +
    ((!cbrSummary.preconditions.gezondheidsverklaringVereist ||
      cbrSummary.preconditions.gezondheidsverklaringGeregeld)
      ? 33
      : 0);

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Examens"
        title="Examenstatus"
        subtitle="Duidelijk zicht op je CBR-voorwaarden, geplande momenten en wat je nog moet regelen."
        icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
      />

      {cbrSummary.derived.lastExamResult ? (
        <StudentExamResultCard
          result={cbrSummary.derived.lastExamResult}
          examAt={cbrSummary.derived.lastExamAt}
          studentName={student.full_name}
          tenantName={tenant.name}
          lastExamNote={cbrSummary.lastExamNote}
          initialConsent={student.review_consent}
        />
      ) : null}

      <StudentShowcaseCard
        title="Examengereedheid"
        eyebrow="Voorwaarden"
        info="Dit scherm combineert theorie, machtiging, gezondheidsverklaring en je eerstvolgende examenmoment."
      >
        <div className="grid grid-cols-[6.8rem_minmax(0,1fr)] gap-4">
          <StudentRing value={readinessPct} label="Klaar" />
          <div className="space-y-3">
            <div className="text-lg font-semibold text-white">
              {cbrSummary.derived.lastExamResult === "passed"
                ? "Je bent geslaagd"
                : cbrSummary.derived.examStatus === "examen_gepland"
                  ? "Je praktijkexamen staat gepland"
                  : cbrSummary.derived.examStatus === "toets_gepland"
                    ? "Je tussentijdse toets staat gepland"
                    : "Je bouwt toe naar je examen"}
            </div>
            <StudentChecklist
              items={[
                {
                  label: "Theoriecertificaat",
                  checked: cbrSummary.preconditions.theorieBehaald,
                },
                {
                  label: "CBR-machtiging",
                  checked: cbrSummary.preconditions.machtigingStatus === "ontvangen",
                },
                {
                  label: "Gezondheidsverklaring",
                  checked:
                    !cbrSummary.preconditions.gezondheidsverklaringVereist ||
                    cbrSummary.preconditions.gezondheidsverklaringGeregeld,
                },
              ]}
            />
          </div>
        </div>
      </StudentShowcaseCard>

      <StudentShowcaseCard
        title="Volgende examendag"
        eyebrow="Planning"
        info="Zodra er een toets of examen ingepland is, zie je hier direct wanneer en waar."
      >
        {cbrSummary.derived.nextAppointmentAt ? (
          <div className="space-y-3">
            <div className="rounded-[1.15rem] border border-primary/16 bg-primary/10 px-3.5 py-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
                {cbrSummary.derived.nextAppointmentType === "exam"
                  ? "Praktijkexamen"
                  : "Tussentijdse toets"}
              </div>
              <div className="mt-1 text-sm text-white/62">
                {dateFmt.format(new Date(cbrSummary.derived.nextAppointmentAt))}
              </div>
            </div>
            <StudentProgressBar
              label="Voorbereiding"
              value={readinessPct}
              rightLabel={`${readinessPct}%`}
            />
          </div>
        ) : (
          <PWAEmptyState message="Er staat nog geen toets of praktijkexamen ingepland." />
        )}
      </StudentShowcaseCard>

      <StudentShowcaseCard
        title="Belangrijk voor jouw examen"
        eyebrow="Checklist"
      >
        <StudentChecklist
          items={[
            {
              label: "Neem een geldig identiteitsbewijs mee",
              checked: false,
            },
            {
              label: "Controleer of je theorie nog geldig is",
              checked: cbrSummary.preconditions.theorieBehaald,
            },
            {
              label: "Zorg voor voldoende lesritme richting examendag",
              checked: balance > 0,
              detail: balance > 0 ? `${Math.round(balance / 60)} uur tegoed beschikbaar` : "Neem contact op voor nieuw pakket",
            },
          ]}
        />
      </StudentShowcaseCard>

      {examPrep ? (
        <ExamPrepCard
          prep={examPrep}
          preconditions={cbrSummary.preconditions}
          balance={balance}
        />
      ) : (
        <StudentShowcaseCard
          title="Nog geen examendossier"
          eyebrow="Voorbereiding"
        >
          <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.02] px-3 py-3 text-sm leading-6 text-white/58">
            Zodra je rijschool een toets of examen voor je reserveert, verschijnen je
            documenten, ophaalinformatie en aandachtspunten hier automatisch.
          </div>
        </StudentShowcaseCard>
      )}

      <div className="px-1 text-xs text-white/42">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Alles wordt getoond in jouw studentcontext binnen {tenant.name}.
        </span>
      </div>
    </PWAPage>
  );
}
