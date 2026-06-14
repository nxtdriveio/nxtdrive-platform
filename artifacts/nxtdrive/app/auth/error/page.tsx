import { headers } from "next/headers";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card } from "@/components/ui/card";
import { BrandProvider } from "@/components/brand-provider";
import { resolveTenantByHost } from "@/lib/tenant/resolve-host";
import {
  getTenantBrandingBundle,
  isWhiteLabelActive,
  resolveLogoUrl,
} from "@/lib/branding";
import { createServiceRoleClient } from "@/lib/supabase/service";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; error_code?: string }>;
}) {
  const params = await searchParams;

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const service = createServiceRoleClient();
  const tenant = await resolveTenantByHost(service, host);

  const bundle = tenant ? await getTenantBrandingBundle(tenant.id) : null;
  const branding = bundle?.branding ?? null;
  const logoUrl = resolveLogoUrl(tenant ?? null, branding);
  const isWhiteLabel = isWhiteLabelActive(tenant ?? null);

  const errorDescription =
    params.error_description
      ? decodeURIComponent(params.error_description)
      : params.error
        ? decodeURIComponent(params.error)
        : "Er is iets misgegaan. De link is mogelijk verlopen of ongeldig.";

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      themeTokens={bundle?.tokens ?? null}
      className="contents"
    >
      <main className="bg-nxt-grid relative flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-10">
        <Card className="w-full max-w-sm space-y-6 p-8">
          <div className="text-center">
            <NxtdriveLogo
              className="mx-auto text-xl"
              logoUrl={logoUrl}
              brandName={isWhiteLabel ? (tenant?.name ?? undefined) : undefined}
            />
            <div className="mt-5 flex justify-center">
              <div className="rounded-full bg-danger/10 p-3">
                <AlertCircle className="h-6 w-6 text-danger" />
              </div>
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-foreground">
              Inloggen mislukt
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorDescription}
            </p>
          </div>

          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Terug naar inloggen
          </Link>
        </Card>

        {!isWhiteLabel && (
          <p className="text-xs text-muted-foreground/50">
            Aangedreven door NXTDRIVE
          </p>
        )}
      </main>
    </BrandProvider>
  );
}
