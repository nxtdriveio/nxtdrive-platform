import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-role";
import { uniqueTenants } from "@/lib/auth/session";
import { setActiveTenantId } from "@/lib/auth/active-tenant";
import { landingPathFor } from "@/lib/auth/redirect-by-role";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

async function chooseTenant(formData: FormData) {
  "use server";
  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) redirect("/select-tenant");

  const user = await requireUser();
  const allowed = uniqueTenants(user).some((t) => t.id === tenantId);
  if (!allowed) redirect("/select-tenant");

  await setActiveTenantId(tenantId);

  // Compute role-aware destination AS IF the user only had this tenant.
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
    <main className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="text-center">
          <NxtdriveLogo className="h-8 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900">
            Kies een rijschool
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Je hebt toegang tot meerdere rijscholen.
          </p>
        </div>

        {tenants.length === 0 ? (
          <p className="text-sm text-slate-600 text-center">
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
                    className="w-full flex items-center justify-between rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50 transition text-left"
                  >
                    <span className="font-medium text-slate-900">{t.name}</span>
                    <span className="text-xs text-slate-500 uppercase">
                      {t.plan}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
