import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import {
  NoChildCard,
  PortalBetalingenCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import { remainingCents } from "@/lib/invoices/types";

export const dynamic = "force-dynamic";

export default async function OuderBetalingenPage() {
  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.betalingen)
    return <SectionDisabledCard title="Betalingen" />;

  const data = await loadPortalSections(ctx, ["betalingen"]);
  if (!data.betalingen) return <SectionDisabledCard title="Betalingen" />;
  const hasPayable = data.betalingen.invoices.some(
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
    <PortalBetalingenCard
      invoices={data.betalingen.invoices}
      paidInvoices={data.betalingen.paidInvoices}
      paidTotalCents={data.betalingen.paidTotalCents}
      outstandingCents={data.betalingen.outstandingCents}
      mollieConfigured={mollieConfigured}
    />
  );
}
