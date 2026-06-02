import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalPlanningCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderPlanningPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.planning) return <SectionDisabledCard title="Planning" />;

  const data = await loadPortalSections(ctx, ["planning"]);
  if (!data.planning) return <SectionDisabledCard title="Planning" />;

  return (
    <PortalPlanningCard
      upcomingLessons={data.planning.upcomingLessons}
      pastLessons={data.planning.pastLessons}
      appointments={data.planning.appointments}
      pastAppointments={data.planning.pastAppointments}
    />
  );
}
