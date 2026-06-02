import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalPakketinformatieCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderPakketinformatiePage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.pakketinformatie)
    return <SectionDisabledCard title="Pakketinformatie" />;

  const data = await loadPortalSections(ctx, ["pakketinformatie"]);
  if (!data.pakketinformatie)
    return <SectionDisabledCard title="Pakketinformatie" />;

  return (
    <PortalPakketinformatieCard packages={data.pakketinformatie.packages} />
  );
}
