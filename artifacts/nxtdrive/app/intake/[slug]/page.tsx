import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { IntakeWizard } from "./intake-wizard";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

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
        />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-semibold text-foreground">NXTDRIVE</span>
        </p>
      </div>
    </main>
  );
}
