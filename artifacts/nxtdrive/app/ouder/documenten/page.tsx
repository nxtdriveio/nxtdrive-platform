import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalDocumentenCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderDocumentenPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.documenten)
    return <SectionDisabledCard title="Documenten" />;

  const data = await loadPortalSections(ctx, ["documenten"]);
  if (!data.documenten) return <SectionDisabledCard title="Documenten" />;

  return <PortalDocumentenCard documents={data.documenten.documents} />;
}
