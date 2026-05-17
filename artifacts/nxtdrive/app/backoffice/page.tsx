import { requireActiveTenant } from "@/lib/auth/require-role";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

export const dynamic = "force-dynamic";

export default async function BackofficePage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);

  return (
    <main className="min-h-screen p-8 bg-slate-50">
      <header className="flex items-center justify-between mb-8">
        <NxtdriveLogo />
        <div className="text-sm text-slate-600">
          {user.profile?.full_name ?? user.email} ·{" "}
          <span className="font-medium">{tenant.name}</span> ·{" "}
          {roles.join(" + ")}
        </div>
      </header>

      <section>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Backoffice
        </h1>
        <p className="text-slate-600">
          Welkom bij {tenant.name}. Dit is de tenant-backoffice. Modules volgen
          in de volgende fases.
        </p>
      </section>
    </main>
  );
}
