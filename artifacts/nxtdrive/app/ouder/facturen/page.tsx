import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalFacturenCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import { remainingCents } from "@/lib/invoices/types";

export const dynamic = "force-dynamic";

export default async function OuderFacturenPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.facturen) return <SectionDisabledCard title="Facturen" />;

  const data = await loadPortalSections(ctx, ["facturen"]);
  if (!data.facturen) return <SectionDisabledCard title="Facturen" />;
  const hasPayable = data.facturen.invoices.some(
    (invoice) =>
      invoice.kind === "invoice" &&
      invoice.status === "open" &&
      remainingCents(invoice) > 0,
  );
  const mollieConfigured = hasPayable
    ? (await getMollieApiKeyStatus(createServiceRoleClient(), ctx.tenant.id))
        .configured
    : false;

  return (
    <PortalFacturenCard
      invoices={data.facturen.invoices}
      outstandingCents={data.facturen.outstandingCents}
      mollieConfigured={mollieConfigured}
    />
  );
}
