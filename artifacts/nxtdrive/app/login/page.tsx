import { headers } from "next/headers";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DevLoginPanel } from "@/components/dev/DevLoginPanel";
import { BrandProvider } from "@/components/brand-provider";
import { sendMagicLink, signInWithPassword } from "./actions";
import { resolveTenantByHost } from "@/lib/tenant/resolve-host";
import { getTenantBrandingPublic, resolveLogoUrl } from "@/lib/branding";
import { createServiceRoleClient } from "@/lib/supabase/service";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const errorMsg = params.error;

  // Resolve tenant from inbound host header (works for both subdomain and
  // verified custom-domain routing). Returns null on the root platform domain
  // or any reserved/unknown host → falls back to NXTDRIVE branding.
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const service = createServiceRoleClient();
  const tenant = await resolveTenantByHost(service, host);

  const branding = tenant ? await getTenantBrandingPublic(tenant.id) : null;
  const logoUrl = resolveLogoUrl(tenant ?? null, branding);
  const isWhiteLabel = tenant?.white_label_enabled === true && tenant?.plan === "elite";

  return (
    <BrandProvider tenant={tenant} branding={branding} className="contents">
      <main className="bg-nxt-grid relative flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-10">
        <DevLoginPanel />
        <Card className="w-full max-w-sm space-y-6 p-8">
          <div className="text-center">
            <NxtdriveLogo
              className="mx-auto text-xl"
              logoUrl={logoUrl}
              brandName={isWhiteLabel ? (tenant?.name ?? undefined) : undefined}
            />
            <h1 className="mt-5 text-2xl font-semibold text-foreground">
              Inloggen
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isWhiteLabel && branding?.welcome_message
                ? branding.welcome_message
                : isWhiteLabel && tenant?.name
                  ? `Log in op ${tenant.name}.`
                  : "Log in met je e-mailadres en wachtwoord."}
            </p>
          </div>

          {sent ? (
            <div className="rounded-md border border-success/30 bg-[color-mix(in_oklab,var(--success)_10%,transparent)] p-3 text-sm text-success">
              Check je inbox — we hebben je een inloglink gestuurd.
            </div>
          ) : null}

          {errorMsg ? (
            <div className="rounded-md border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-3 text-sm text-danger">
              {decodeURIComponent(errorMsg)}
            </div>
          ) : null}

          <form action={signInWithPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="naam@rijschool.nl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full">
              Inloggen
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide">
              <span className="bg-card px-2 text-muted-foreground">of</span>
            </div>
          </div>

          <form action={sendMagicLink} className="space-y-3">
            <p className="text-center text-xs text-muted-foreground">
              Wachtwoord vergeten? Vul hierboven je e-mailadres in en vraag een
              inloglink aan.
            </p>
            <Button type="submit" variant="outline" className="w-full">
              Stuur inloglink per e-mail
            </Button>
          </form>
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
