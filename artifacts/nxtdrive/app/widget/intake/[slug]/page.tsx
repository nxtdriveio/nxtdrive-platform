import { notFound } from "next/navigation";
import { BrandProvider } from "@/components/brand-provider";
import { WidgetResizeBridge } from "@/components/intake/WidgetResizeBridge";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getTenantBrandingBundle,
  resolveBrandName,
  resolveLogoUrl,
} from "@/lib/branding";
import type { Tenant } from "@/lib/types";
import {
  IntakeWizard,
  type IntakeTrackingContext,
} from "@/app/intake/[slug]/intake-wizard";
import { LEAD_SOURCES, type LeadSource } from "@/lib/leads/types";

export const dynamic = "force-dynamic";

type WidgetSearchParams = {
  embed?: string | string[];
  source?: string | string[];
  campaign?: string | string[];
  utm_source?: string | string[];
  utm_medium?: string | string[];
  utm_campaign?: string | string[];
  utm_content?: string | string[];
  utm_term?: string | string[];
  gclid?: string | string[];
  fbclid?: string | string[];
  msclkid?: string | string[];
  referrer?: string | string[];
  landing_url?: string | string[];
  embed_host?: string | string[];
  ref?: string | string[];
  error?: string | string[];
};

function firstParam(value: string | string[] | undefined, max = 500) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim()
    ? raw.trim().slice(0, max)
    : undefined;
}

function trackingFromSearch(sp: WidgetSearchParams): IntakeTrackingContext {
  const mode = firstParam(sp.embed) === "script" ? "script" : "iframe";
  return {
    mode,
    source: firstParam(sp.source),
    campaign: firstParam(sp.campaign),
    utm_source: firstParam(sp.utm_source),
    utm_medium: firstParam(sp.utm_medium),
    utm_campaign: firstParam(sp.utm_campaign),
    utm_content: firstParam(sp.utm_content),
    utm_term: firstParam(sp.utm_term),
    gclid: firstParam(sp.gclid),
    fbclid: firstParam(sp.fbclid),
    msclkid: firstParam(sp.msclkid),
    referrer: firstParam(sp.referrer, 1000),
    landing_url: firstParam(sp.landing_url, 1000),
    embed_host: firstParam(sp.embed_host),
  };
}

function sourceFromSearch(sp: WidgetSearchParams): LeadSource {
  const raw = (firstParam(sp.source) ?? firstParam(sp.utm_source) ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .trim();
  const normalized = raw.includes("google")
    ? "google"
    : raw === "meta" || raw.includes("facebook") || raw === "fb"
      ? "facebook"
      : raw.includes("instagram")
        ? "instagram"
        : raw.includes("whatsapp")
          ? "whatsapp"
          : raw.includes("referral")
            ? "referral"
            : raw;

  return (LEAD_SOURCES as readonly string[]).includes(normalized)
    ? (normalized as LeadSource)
    : "website";
}

export default async function IntakeWidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<WidgetSearchParams>;
}) {
  const { slug } = await params;
  const search = await searchParams;

  const service = createServiceRoleClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("id, slug, name, plan, white_label_enabled")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  const typedTenant = tenant as Tenant;
  const bundle = await getTenantBrandingBundle(typedTenant.id);
  const brandName = resolveBrandName(typedTenant);
  const logoUrl = resolveLogoUrl(typedTenant, bundle.branding);
  const showPlatformCredit = brandName === "NXTDRIVE";
  const ref = firstParam(search.ref, 40);
  const error = firstParam(search.error, 500);

  return (
    <BrandProvider
      tenant={typedTenant}
      branding={bundle.branding}
      themeTokens={bundle.tokens}
      forceLightTheme
      className="min-h-screen bg-transparent text-foreground"
    >
      <WidgetResizeBridge tenant={typedTenant.slug} />
      <main className="mx-auto w-full max-w-[760px] px-3 py-3 sm:px-4 sm:py-4">
        <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <div className="border-b border-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_13%,white),#fff_52%,color-mix(in_oklab,var(--brand-secondary)_13%,white))] px-5 py-5 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <NxtdriveLogo
                  className="text-lg"
                  logoUrl={logoUrl}
                  brandName={brandName}
                />
                <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  Start met rijles bij {brandName}
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  Vraag vrijblijvend een proefles aan. We koppelen je aanvraag
                  direct aan planning, beschikbaarheid en de juiste opvolging.
                </p>
              </div>
              <span className="hidden rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground sm:inline-flex">
                Snel geregeld
              </span>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <span className="rounded-full border border-border bg-card/80 px-3 py-2">
                Mobielvriendelijk
              </span>
              <span className="rounded-full border border-border bg-card/80 px-3 py-2">
                Beveiligde aanvraag
              </span>
              <span className="rounded-full border border-border bg-card/80 px-3 py-2">
                Proeflesvoorstel mogelijk
              </span>
            </div>
          </div>

          <div className="bg-background/70 p-3 sm:p-5">
            <IntakeWizard
              slug={typedTenant.slug}
              embedded
              serverError={error ? decodeURIComponent(error) : undefined}
              referralCode={ref}
              defaultSource={sourceFromSearch(search)}
              tracking={trackingFromSearch(search)}
            />
            <p className="mt-4 text-center text-[11px] leading-5 text-muted-foreground">
              Beschermd tegen spam.
              {showPlatformCredit ? (
                <>
                  {" "}
                  Powered by{" "}
                  <span className="font-semibold text-foreground">
                    NXTDRIVE
                  </span>
                  .
                </>
              ) : null}
            </p>
          </div>
        </section>
      </main>
    </BrandProvider>
  );
}
