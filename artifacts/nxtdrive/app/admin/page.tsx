import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const user = await requirePlatformAdmin();
  const service = createServiceRoleClient();

  const { data: tenants } = await service
    .from("tenants")
    .select("id, slug, name, plan, white_label_enabled, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen p-8 bg-slate-50">
      <header className="flex items-center justify-between mb-8">
        <NxtdriveLogo />
        <div className="text-sm text-slate-600">
          {user.profile?.full_name ?? user.email} · platform admin
        </div>
      </header>

      <section>
        <h1 className="text-2xl font-semibold text-slate-900 mb-4">
          Tenants ({tenants?.length ?? 0})
        </h1>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">White-label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants?.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                    {t.slug}
                  </td>
                  <td className="px-4 py-3 uppercase text-xs text-slate-700">
                    {t.plan}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.white_label_enabled ? "ja" : "nee"}
                  </td>
                </tr>
              )) ?? null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
