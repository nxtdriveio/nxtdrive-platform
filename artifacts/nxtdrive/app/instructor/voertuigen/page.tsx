import { CarFront, MapPin, Navigation, Wrench } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadLocations, loadVehicles } from "@/lib/lessons/context-data";
import { VEHICLE_TRANSMISSION_LABEL } from "@/lib/lessons/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  PWAEmptyState,
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

export default async function InstructorVehiclesPage() {
  const { tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const [vehicles, locations] = await Promise.all([
    loadVehicles(supabase, tenant.id, { includeShared: true }),
    loadLocations(supabase, tenant.id, { includeShared: true }),
  ]);

  const activeVehicles = vehicles.filter((vehicle) => vehicle.active);
  const activeLocations = locations.filter((location) => location.active);

  return (
    <PWAPage app="instructor" contentClassName="space-y-5">
      <PWAPageHeader
        eyebrow="Middelen"
        title="Voertuigen"
        description="Een rustige read-only cockpit van je beschikbare lesauto's en veelgebruikte locaties, direct vanuit de instructeurapp."
        align="left"
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Actieve voertuigen"
          value={activeVehicles.length}
          hint="Auto's die momenteel inzetbaar zijn."
          info="Alle voertuigen die in deze tenant actief staan en dus beschikbaar kunnen zijn voor lessen."
        />
        <PWAKpiTile
          label="Locaties"
          value={activeLocations.length}
          hint="Actieve ophaal- en vertrekpunten."
          info="Beschikbare locaties die je later kunt terugzien in lescontext en planning."
        />
        <PWAKpiTile
          label="Cockpitmodus"
          value="Read-only"
          hint="Wijzigen loopt nog via beheerflows."
          info="Deze instructeurspagina is bewust compact en leesgericht, zodat je onderweg snel ziet wat je nodig hebt."
        />
      </PWAKpiGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <PWACard title="Lesauto's" className="bg-card" contentClassName="space-y-3">
          {activeVehicles.length === 0 ? (
            <PWAEmptyState
              icon={<CarFront className="h-8 w-8" aria-hidden />}
              title="Nog geen voertuigen zichtbaar"
              message="Zodra voertuigen in je tenant actief en zichtbaar zijn, verschijnen ze hier in een overzicht."
            />
          ) : (
            activeVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex flex-col gap-3 rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-primary-soft text-primary">
                    <CarFront className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{vehicle.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {vehicle.transmission
                        ? VEHICLE_TRANSMISSION_LABEL[vehicle.transmission]
                        : "Transmissie volgt"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {vehicle.license_plate ? (
                    <Badge variant="outline">{vehicle.license_plate}</Badge>
                  ) : null}
                  <Badge variant="success">Actief</Badge>
                </div>
              </div>
            ))
          )}
        </PWACard>

        <div className="space-y-5">
          <PWACard title="Locaties" className="bg-card" contentClassName="space-y-3">
            {activeLocations.length === 0 ? (
              <PWAEmptyState
                icon={<MapPin className="h-8 w-8" aria-hidden />}
                title="Nog geen locaties zichtbaar"
                message="Actieve vertrek- of ophaallocaties verschijnen hier zodra ze voor jouw cockpit beschikbaar zijn."
              />
            ) : (
              activeLocations.slice(0, 6).map((location) => (
                <div
                  key={location.id}
                  className="rounded-[1.15rem] border border-border/70 bg-background/70 px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden />
                    {location.name}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {location.address ?? "Adres volgt in de lescontext"}
                  </p>
                </div>
              ))
            )}
          </PWACard>

          <PWACard title="Waarom dit hier staat" className="bg-card" contentClassName="space-y-3">
            <div className="rounded-[1.15rem] border border-border/70 bg-background/70 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Navigation className="h-4 w-4 text-primary" aria-hidden />
                Onderweg snel raadplegen
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Je hoeft niet uit de instructeurapp te springen om snel te zien welke auto of locatie binnen je rijschool actief is.
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-border/70 bg-background/70 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Wrench className="h-4 w-4 text-primary" aria-hidden />
                Beheer blijft bewust centraal
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Activeren, koppelen en structureel beheren loopt nog via de beheerschermen, zodat de cockpit onderweg licht blijft.
              </p>
            </div>
          </PWACard>
        </div>
      </div>
    </PWAPage>
  );
}
