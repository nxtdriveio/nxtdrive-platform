import { requireActiveTenant } from "@/lib/auth/require-role";
import { PWAPageHeader, PWACard } from "@/components/pwa/primitives";
import { Settings, User } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InstructorInstellingenPage() {
  const { user, tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const fullName = user.profile?.full_name ?? user.email ?? "Instructeur";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <PWAPageHeader
        title="Instellingen"
        subtitle="Jouw profiel en app-voorkeuren"
        icon={<Settings className="h-4 w-4" aria-hidden />}
      />

      <PWACard title={<><User className="h-4 w-4" aria-hidden /> Profiel</>}>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Naam</dt>
            <dd className="font-medium text-foreground truncate">{fullName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">E-mailadres</dt>
            <dd className="font-medium text-foreground truncate">{user.email ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">School</dt>
            <dd className="font-medium text-foreground truncate">{tenant.name}</dd>
          </div>
        </dl>
      </PWACard>
    </div>
  );
}
