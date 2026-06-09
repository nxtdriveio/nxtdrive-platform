import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyEditor } from "@/components/availability/WeeklyEditor";
import { ExceptionsManager } from "@/components/availability/ExceptionsManager";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import {
  loadExceptions,
  loadWeeklyAvailability,
} from "@/lib/availability/service";
import {
  addAvailabilityException,
  deleteAvailabilityException,
  saveWeeklyAvailability,
} from "@/lib/availability/actions";

export const dynamic = "force-dynamic";

const REDIRECT = "/instructor/beschikbaarheid";

export default async function InstructorAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenant, user } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();

  const [weekly, exceptions] = await Promise.all([
    loadWeeklyAvailability(supabase, tenant.id, user.id),
    loadExceptions(supabase, tenant.id, user.id),
  ]);

  return (
    <PWAPage contentClassName="mx-auto max-w-3xl space-y-6">
      <PWAPageHeader
        eyebrow="Planning"
        title="Mijn beschikbaarheid"
        description="Stel je wekelijkse beschikbaarheid in en beheer uitzonderingen voor specifieke datums. Tijden zijn in UTC."
        align="left"
        actions={
          <Link
            href="/instructor/week"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Terug naar weekplanning
          </Link>
        }
      />

      {sp.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Opslaan mislukt: {sp.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Wekelijks schema</CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyEditor
            initial={weekly}
            instructorId={user.id}
            redirectTo={REDIRECT}
            action={saveWeeklyAvailability}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uitzonderingen</CardTitle>
        </CardHeader>
        <CardContent>
          <ExceptionsManager
            exceptions={exceptions}
            instructorId={user.id}
            redirectTo={REDIRECT}
            addAction={addAvailabilityException}
            deleteAction={deleteAvailabilityException}
          />
        </CardContent>
      </Card>
    </PWAPage>
  );
}
