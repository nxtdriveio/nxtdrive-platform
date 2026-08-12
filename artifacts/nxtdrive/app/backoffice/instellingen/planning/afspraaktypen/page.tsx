import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
} from "@/components/backoffice/admin-primitives";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadAppointmentTypePolicies,
  loadAppointmentWizardSettings,
} from "@/domains/planning/application/appointment-policy-service";
import { AppointmentTypePolicyManager } from "./appointment-type-policy-manager";

export const dynamic = "force-dynamic";

export default async function AppointmentTypesSettingsPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const service = createServiceRoleClient();
  const [policies, settings] = await Promise.all([
    loadAppointmentTypePolicies(service, tenant.id),
    loadAppointmentWizardSettings(service, tenant.id),
  ]);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Instellingen · Planning"
        title="Afspraaktypen"
        description={`Configureer voor ${tenant.name} welke afspraaktypen instructeurs mogen plannen en welke defaults, buffers en overridegrenzen daarbij gelden.`}
        actions={
          <Link
            href="/backoffice/instellingen"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar instellingen
          </Link>
        }
      />

      <p className="rounded-2xl border border-blue-300/40 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-950 dark:border-blue-800/50 dark:bg-blue-950/25 dark:text-blue-100">
        Platformwaarden zijn startdefaults voor nieuwe planning, geen landelijke
        normen. Wijzigingen gelden alleen voor nieuwe of expliciet opnieuw
        geplande afspraken; bestaande afspraken bewaren hun toegepaste
        beleidssnapshot.
      </p>

      <AppointmentTypePolicyManager policies={policies} settings={settings} />
    </AdminPage>
  );
}
