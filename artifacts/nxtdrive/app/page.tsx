import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { resolveTenantByHost } from "@/lib/tenant/resolve-host";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Host-based tenant resolution (Task #201). When the request arrives on a
  // tenant subdomain (`<slug>.nxtdrive.io`) or a *verified* custom domain, the
  // root serves that tenant's public intake instead of the platform marketing
  // page. Resolution is purely additive: any unknown/platform host (or a lookup
  // error) returns null and falls through to the platform landing below.
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? null;
  const tenant = await resolveTenantByHost(createServiceRoleClient(), host);
  if (tenant) {
    redirect(`/intake/${tenant.slug}`);
  }

  return (
    <main className="bg-nxt-grid relative min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-12 text-center">
        <NxtdriveLogo className="text-3xl" />
        <h1 className="mt-10 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          De slimme software voor{" "}
          <span className="bg-gradient-to-r from-brand-300 via-brand-500 to-brand-700 bg-clip-text text-transparent">
            moderne rijscholen
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
          Van eerste lead tot geslaagd examen — alles in één systeem. Plannen,
          leerlingen, voortgang, betalingen en meer.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            Inloggen
          </Link>
          <Link
            href="mailto:sales@nxtdrive.io?subject=Demo%20NXTDRIVE%20aanvragen"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-6 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Plan een demo
          </Link>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">
          NXTDRIVE · multi-tenant SaaS voor rijscholen
        </p>
      </div>
    </main>
  );
}
