import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-role";
import { uniqueTenants } from "@/lib/auth/session";
import { setActiveTenantId } from "@/lib/auth/active-tenant";
import { landingPathFor } from "@/lib/auth/redirect-by-role";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

async function chooseTenant(formData: FormData) {
  "use server";
  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) redirect("/select-tenant");

  const user = await requireUser();
  const allowed = uniqueTenants(user).some((t) => t.id === tenantId);
  if (!allowed) redirect("/select-tenant");

  await setActiveTenantId(tenantId);

  const scoped = {
    ...user,
    memberships: user.memberships.filter((m) => m.tenant_id === tenantId),
  };
  redirect(landingPathFor(scoped));
}

export default async function SelectTenantPage() {
  const user = await requireUser();
  const tenants = uniqueTenants(user);

  return (
    <main className="bg-nxt-grid relative flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md space-y-6 p-8">
        <div className="text-center">
          <NxtdriveLogo className="mx-auto text-xl" />
          <h1 className="mt-5 text-xl font-semibold text-foreground">
            Kies een rijschool
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Je hebt toegang tot meerdere rijscholen.
          </p>
        </div>

        {tenants.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Je hebt nog geen toegang. Neem contact op met je rijschool.
          </p>
        ) : (
          <ul className="space-y-2">
            {tenants.map((t) => (
              <li key={t.id}>
                <form action={chooseTenant}>
                  <input type="hidden" name="tenant_id" value={t.id} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
                  >
                    <span className="font-medium text-foreground">{t.name}</span>
                    <Badge variant="primary">{t.plan}</Badge>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
