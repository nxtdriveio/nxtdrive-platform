import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalVoortgangCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderVoortgangPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.voortgang)
    return <SectionDisabledCard title="Voortgang" />;

  const data = await loadPortalSections(ctx, ["voortgang"]);
  if (!data.voortgang) return <SectionDisabledCard title="Voortgang" />;

  return (
    <PortalVoortgangCard
      readiness={data.voortgang.readiness}
      lessonHistory={data.voortgang.lessonHistory}
    />
  );
}
