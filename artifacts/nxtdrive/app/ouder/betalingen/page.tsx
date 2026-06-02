import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalBetalingenCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderBetalingenPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.betalingen)
    return <SectionDisabledCard title="Betalingen" />;

  const data = await loadPortalSections(ctx, ["betalingen"]);
  if (!data.betalingen) return <SectionDisabledCard title="Betalingen" />;

  return (
    <PortalBetalingenCard
      paidInvoices={data.betalingen.paidInvoices}
      paidTotalCents={data.betalingen.paidTotalCents}
    />
  );
}
