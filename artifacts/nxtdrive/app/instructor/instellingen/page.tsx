import { LogOut, Settings, User, Bell } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { PWAPageHeader, PWACard, PWASectionHeader } from "@/components/pwa/primitives";
import { Avatar } from "@/components/ui/avatar";
import { PushToggle } from "@/components/notifications/PushToggle";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import { buttonVariants } from "@/components/ui/button";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function InstructorInstellingenPage() {
  const { user, tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const vapidPublicKey = getVapidPublicKey();
  const fullName = user.profile?.full_name ?? user.email ?? "Instructeur";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <PWAPageHeader
        title="Instellingen"
        subtitle="Jouw profiel en app-voorkeuren"
        icon={<Settings className="h-4 w-4" aria-hidden />}
      />

      {/* Profile card */}
      <PWACard title={<><User className="h-4 w-4" aria-hidden /> Profiel</>}>
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <Avatar name={fullName} className="h-14 w-14 text-base shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-foreground">{fullName}</div>
            <div className="text-xs text-muted-foreground">{tenant.name}</div>
          </div>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <ProfileForm initialName={user.profile?.full_name ?? ""} />

          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">E-mailadres</dt>
            <dd className="truncate text-right font-medium text-foreground">
              {user.email ?? "—"}
            </dd>
          </div>

          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">School</dt>
            <dd className="truncate text-right font-medium text-foreground">
              {tenant.name}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">
          Je e-mailadres en schoolkoppeling worden beheerd door de schoolbeheerder.
        </p>
      </PWACard>

      {/* Notification preferences */}
      <div>
        <PWASectionHeader icon={<Bell className="h-3.5 w-3.5" aria-hidden />}>
          Meldingen
        </PWASectionHeader>
        <PushToggle vapidPublicKey={vapidPublicKey} />
      </div>

      {/* Sign out */}
      <form action="/auth/logout" method="post">
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Uitloggen
        </button>
      </form>
    </div>
  );
}
