import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { IntakeWizard, type IntakeTrackingContext } from "./intake-wizard";
import { LEAD_SOURCES, type LeadSource } from "@/lib/leads/types";

export const dynamic = "force-dynamic";

type IntakeSearchParams = {
  error?: string;
  ref?: string;
  source?: string;
  campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
};

function firstParam(value: string | string[] | undefined, max = 240) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim()
    ? raw.trim().slice(0, max)
    : undefined;
}

function trackingFromSearch(sp: IntakeSearchParams): IntakeTrackingContext {
  return {
    mode: "standalone",
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
  };
}

function sourceFromSearch(sp: IntakeSearchParams): LeadSource {
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

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<IntakeSearchParams>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const { error, ref } = search;

  // Public page: look up tenant via service role (RLS would block anon).
  const service = createServiceRoleClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  return (
    <main className="bg-nxt-grid relative min-h-screen px-6 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <NxtdriveLogo className="text-xl" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            Aanmelden bij {tenant.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vul de aanmelding in vijf korte stappen in — zo kunnen we je traject
            goed voorbereiden.
          </p>
        </div>

        <IntakeWizard
          slug={tenant.slug}
          serverError={error ? decodeURIComponent(error) : undefined}
          referralCode={ref ? ref.slice(0, 40) : undefined}
          defaultSource={sourceFromSearch(search)}
          tracking={trackingFromSearch(search)}
        />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-semibold text-foreground">NXTDRIVE</span>
        </p>
      </div>
    </main>
  );
}
