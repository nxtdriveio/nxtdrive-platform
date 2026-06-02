import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalExamensCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderExamensPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.examens) return <SectionDisabledCard title="Examens" />;

  const data = await loadPortalSections(ctx, ["examens"]);
  if (!data.examens) return <SectionDisabledCard title="Examens" />;

  return (
    <PortalExamensCard
      cbrStatus={data.examens.cbrStatus}
      cbrChecklist={data.examens.cbrChecklist}
      examAppointments={data.examens.examAppointments}
    />
  );
}
