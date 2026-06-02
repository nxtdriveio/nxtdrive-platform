import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyEditor } from "@/components/availability/WeeklyEditor";
import { ExceptionsManager } from "@/components/availability/ExceptionsManager";
import {
  loadExceptions,
  loadTenantInstructors,
  loadWeeklyAvailability,
} from "@/lib/availability/service";
import {
  addAvailabilityException,
  deleteAvailabilityException,
  saveWeeklyAvailability,
} from "@/lib/availability/actions";
import { InstructorPicker } from "./instructor-picker";

export const dynamic = "force-dynamic";

const BASE = "/backoffice/beschikbaarheid";

export default async function BackofficeAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ instructor?: string; error?: string }>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();

  const instructors = await loadTenantInstructors(tenant.id);
  const selectedId =
    instructors.find((i) => i.id === sp.instructor)?.id ??
    instructors[0]?.id ??
    null;
  const redirectTo = selectedId
    ? `${BASE}?instructor=${selectedId}`
    : BASE;

  const [weekly, exceptions] = selectedId
    ? await Promise.all([
        loadWeeklyAvailability(supabase, tenant.id, selectedId),
        loadExceptions(supabase, tenant.id, selectedId),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Beschikbaarheid
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer per instructeur het wekelijkse beschikbaarheidsschema en
          uitzonderingen. Tijden zijn in UTC.
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Opslaan mislukt: {sp.error}
        </div>
      )}

      {instructors.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Er zijn nog geen instructeurs in deze rijschool.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Instructeur</CardTitle>
            </CardHeader>
            <CardContent>
              <InstructorPicker
                instructors={instructors}
                selectedId={selectedId}
              />
            </CardContent>
          </Card>

          {selectedId && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Wekelijks schema</CardTitle>
                </CardHeader>
                <CardContent>
                  <WeeklyEditor
                    key={`weekly-${selectedId}`}
                    initial={weekly}
                    instructorId={selectedId}
                    redirectTo={redirectTo}
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
                    key={`exc-${selectedId}`}
                    exceptions={exceptions}
                    instructorId={selectedId}
                    redirectTo={redirectTo}
                    addAction={addAvailabilityException}
                    deleteAction={deleteAvailabilityException}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
