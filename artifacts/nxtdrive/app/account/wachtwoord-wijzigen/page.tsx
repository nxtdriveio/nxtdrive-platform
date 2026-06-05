import { headers } from "next/headers";
import { BrandProvider } from "@/components/brand-provider";
import { resolveTenantByHost } from "@/lib/tenant/resolve-host";
import { getTenantBrandingPublic, resolveLogoUrl } from "@/lib/branding";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { WachtwoordWijzigenForm } from "./wachtwoord-wijzigen-form";

export default async function WachtwoordWijzigenPage() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const service = createServiceRoleClient();
  const tenant = await resolveTenantByHost(service, host);

  const branding = tenant ? await getTenantBrandingPublic(tenant.id) : null;
  const logoUrl = resolveLogoUrl(tenant ?? null, branding);
  const isWhiteLabel = tenant?.white_label_enabled === true && tenant?.plan === "elite";

  return (
    <BrandProvider tenant={tenant} branding={branding} className="contents">
      <WachtwoordWijzigenForm
        logoUrl={logoUrl}
        brandName={isWhiteLabel ? (tenant?.name ?? undefined) : undefined}
        isWhiteLabel={isWhiteLabel}
      />
    </BrandProvider>
  );
}
