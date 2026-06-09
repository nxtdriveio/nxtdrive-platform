import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyEditor } from "@/components/availability/WeeklyEditor";
import { ExceptionsManager } from "@/components/availability/ExceptionsManager";
import {
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";
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
  const activeWeekdays = new Set(weekly.map((block) => block.weekday)).size;

  return (
    <PWAPage app="instructor" contentClassName="space-y-5 xl:space-y-6">
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
            Terug naar agenda
          </Link>
        }
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Actieve blokken"
          value={weekly.length}
          hint="Terugkerende tijdvakken in je basisweek."
          info="Alle wekelijkse beschikbaarheidsblokken die standaard terugkomen in jouw agenda."
        />
        <PWAKpiTile
          label="Beschikbare dagen"
          value={activeWeekdays}
          hint="Dagen waarop je momenteel lesruimte openzet."
          info="Aantal weekdagen waarop je nu één of meer lesvensters beschikbaar hebt gemaakt."
        />
        <PWAKpiTile
          label="Uitzonderingen"
          value={exceptions.length}
          hint="Vakantie, examenmomenten of extra openingen."
          info="Eenmalige afwijkingen op je basisweek, zoals vakantie, losse openingen of geblokkeerde momenten."
        />
      </PWAKpiGrid>

      {sp.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Opslaan mislukt: {sp.error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(21rem,0.82fr)]">
        <Card className="h-full">
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

        <div className="space-y-5">
          <PWACard
            title="Ritme en uitzonderingen"
            className="bg-card"
            contentClassName="space-y-2"
          >
            <p className="text-sm leading-6 text-muted-foreground">
              Houd je basisweek links compact en gebruik uitzonderingen alleen
              voor dagen die afwijken. Zo blijft je planning overzichtelijk en
              past deze pagina beter in een tabletviewport.
            </p>
          </PWACard>

          <Card className="h-full">
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
        </div>
      </div>
    </PWAPage>
  );
}
