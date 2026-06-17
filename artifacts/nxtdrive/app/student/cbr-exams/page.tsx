import { BadgeCheck, ShieldCheck } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentCBRStatusList,
  StudentPageHeader,
  StudentReadinessCard,
  StudentSection,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentCbrExamsPage() {
  const { experience } = await getStudentPwaContext();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="CBR & Examens"
        title="Je examenstatus"
        subtitle="Schoolstatus voor machtiging, theorie, gezondheidsverklaring en praktijkexamen. Dit is geen live CBR-sync."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(22rem,0.75fr)_minmax(0,1.25fr)]">
        <StudentSection title="Gereedheid" icon={BadgeCheck}>
          <StudentReadinessCard
            readiness={experience.cbr.readiness}
            copy={experience.cbr.readinessCopy}
          />
        </StudentSection>

        <StudentSection title="Statussen" icon={ShieldCheck}>
          <StudentCBRStatusList items={experience.cbr.statuses} />
        </StudentSection>
      </div>
    </div>
  );
}
