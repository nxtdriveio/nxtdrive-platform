import { Bell, LogOut, Settings, User } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
  PWASectionHeader,
} from "@/components/pwa/primitives";
import { Avatar } from "@/components/ui/avatar";
import { PushToggle } from "@/components/notifications/PushToggle";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import { getNotificationPreference } from "@/lib/notifications/push-actions";
import { buttonVariants } from "@/components/ui/button";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function InstructorInstellingenPage() {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const [vapidPublicKey, serverPushEnabled] = await Promise.all([
    Promise.resolve(getVapidPublicKey()),
    getNotificationPreference(),
  ]);
  const fullName = user.profile?.full_name ?? user.email ?? "Instructeur";

  return (
    <PWAPage app="instructor" contentClassName="space-y-5">
      <PWAPageHeader
        title="Instellingen"
        subtitle="Jouw profiel en app-voorkeuren"
        icon={<Settings className="h-4 w-4" aria-hidden />}
        align="left"
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Profiel"
          value={fullName}
          hint="De naam die leerlingen en planners hier zien."
        />
        <PWAKpiTile
          label="Rijschool"
          value={tenant.name}
          hint="Je bent gekoppeld aan deze organisatie."
        />
        <PWAKpiTile
          label="Pushstatus"
          value={serverPushEnabled ? "Aan" : "Uit"}
          hint="Per apparaat verder te beheren in meldingen."
        />
      </PWAKpiGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)]">
        <PWACard
          title={
            <>
              <User className="h-4 w-4" aria-hidden /> Profiel
            </>
          }
        >
          <div className="flex items-center gap-4 border-b border-border pb-4">
            <Avatar name={fullName} className="h-14 w-14 shrink-0 text-base" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-foreground">
                {fullName}
              </div>
              <div className="text-xs text-muted-foreground">{tenant.name}</div>
            </div>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <ProfileForm initialName={user.profile?.full_name ?? ""} />

            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">E-mailadres</dt>
              <dd className="truncate text-right font-medium text-foreground">
                {user.email ?? "-"}
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
            Je e-mailadres en schoolkoppeling worden beheerd door de
            schoolbeheerder.
          </p>
        </PWACard>

        <div className="space-y-5">
          <div>
            <PWASectionHeader icon={<Bell className="h-3.5 w-3.5" aria-hidden />}>
              Meldingen
            </PWASectionHeader>
            <PushToggle
              vapidPublicKey={vapidPublicKey}
              serverPushEnabled={serverPushEnabled}
            />
          </div>

          <PWACard title="Account">
            <p className="text-sm leading-6 text-muted-foreground">
              Gebruik deze pagina voor je persoonlijke voorkeuren. Voor je
              dagritme, planning en leerlingen ga je terug naar de cockpit.
            </p>

            <form action="/auth/logout" method="post" className="mt-4">
              <button
                type="submit"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Uitloggen
              </button>
            </form>
          </PWACard>
        </div>
      </div>
    </PWAPage>
  );
}
