import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalFacturenCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderFacturenPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.facturen) return <SectionDisabledCard title="Facturen" />;

  const data = await loadPortalSections(ctx, ["facturen"]);
  if (!data.facturen) return <SectionDisabledCard title="Facturen" />;

  return (
    <PortalFacturenCard
      invoices={data.facturen.invoices}
      outstandingCents={data.facturen.outstandingCents}
    />
  );
}
