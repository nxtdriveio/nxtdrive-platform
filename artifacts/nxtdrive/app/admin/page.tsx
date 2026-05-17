import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const user = await requirePlatformAdmin();
  const service = createServiceRoleClient();

  const { data: tenants } = await service
    .from("tenants")
    .select("id, slug, name, plan, white_label_enabled, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-background p-8">
      <header className="mb-8 flex items-center justify-between">
        <NxtdriveLogo className="text-lg" />
        <div className="text-sm text-muted-foreground">
          {user.profile?.full_name ?? user.email} ·{" "}
          <span className="text-foreground">platform admin</span>
        </div>
      </header>

      <section>
        <h1 className="mb-4 text-2xl font-semibold text-foreground">
          Tenants ({tenants?.length ?? 0})
        </h1>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">White-label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants?.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {t.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {t.slug}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="primary">{t.plan}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.white_label_enabled ? "ja" : "nee"}
                  </td>
                </tr>
              )) ?? null}
            </tbody>
          </table>
        </Card>
      </section>
    </main>
  );
}
