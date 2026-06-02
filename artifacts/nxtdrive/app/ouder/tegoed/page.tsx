import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalTegoedCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderTegoedPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.tegoed) return <SectionDisabledCard title="Lestegoed" />;

  const data = await loadPortalSections(ctx, ["tegoed"]);
  if (!data.tegoed) return <SectionDisabledCard title="Lestegoed" />;

  return (
    <PortalTegoedCard balance={data.tegoed.balance} ledger={data.tegoed.ledger} />
  );
}
