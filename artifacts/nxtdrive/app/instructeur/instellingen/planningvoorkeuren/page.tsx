import Link from "next/link";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadAppointmentTypePolicies,
  loadInstructorAppointmentPreferences,
} from "@/domains/planning/application/appointment-policy-service";
import { InstructorPlanningPreferencesManager } from "./instructor-planning-preferences-manager";

export const dynamic = "force-dynamic";

export default async function InstructorPlanningPreferencesPage() {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const service = createServiceRoleClient();
  const [policies, preferences] = await Promise.all([
    loadAppointmentTypePolicies(service, tenant.id),
    loadInstructorAppointmentPreferences(service, tenant.id, user.id),
  ]);

  return (
    <div className="min-w-0 space-y-4 xl:space-y-5">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">
            Instellingen · Planning
          </p>
          <h1 className="mt-1 text-[1.65rem] font-black leading-tight text-foreground sm:text-2xl xl:text-[2.35rem]">
            Mijn planningvoorkeuren
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Laat NXTDRIVE je voorkeursduur en buffers automatisch voorstellen.
            Vergrendelde rijschoolregels blijven altijd leidend.
          </p>
        </div>
        <Link
          href="/instructeur/instellingen"
          className={buttonVariants({ variant: "outline" })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Terug naar instellingen
        </Link>
      </div>

      <section className="flex gap-3 rounded-[1.35rem] border border-brand-border/80 bg-brand-accent/55 p-4 text-sm leading-6 text-foreground shadow-sm">
        <SlidersHorizontal
          className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary"
          aria-hidden
        />
        <p>
          Laat een veld leeg om de rijschoolstandaard te gebruiken. Een
          persoonlijke voorkeur geldt alleen voor nieuwe afspraken en alleen
          binnen de vrijgegeven minimum-, maximum- en bufferregels.
        </p>
      </section>

      <InstructorPlanningPreferencesManager
        policies={policies}
        preferences={preferences}
      />
    </div>
  );
}
