import { requireActiveOrganization } from "@/lib/organization/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BranchFilterChips,
  BranchScopeSummary,
} from "@/components/backoffice/branch-scope-ui";
import { WeeklyEditor } from "@/components/availability/WeeklyEditor";
import { ExceptionsManager } from "@/components/availability/ExceptionsManager";
import { listBranches } from "@/lib/branches/service";
import { loadOrganizationBranchScope } from "@/lib/organization/branch-scope";
import { canAccessBranch } from "@/lib/permissions";
import {
  loadExceptions,
  loadTenantInstructors,
  loadWeeklyAvailability,
  summarizeAvailability,
} from "@/lib/availability/service";
import {
  addAvailabilityException,
  deleteAvailabilityException,
  saveWeeklyAvailability,
} from "@/lib/availability/actions";
import { InstructorPicker } from "./instructor-picker";
import { AvailabilityScopePicker } from "./availability-scope-picker";

export const dynamic = "force-dynamic";

const BASE = "/backoffice/beschikbaarheid";

export default async function BackofficeAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ instructor?: string; branch?: string; error?: string }>;
}) {
  const context = await requireActiveOrganization([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
  ]);
  const { organization: tenant } = context;
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  const allBranches = await listBranches(service, tenant.id, { activeOnly: true });
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((branch) => branchScope.branch_ids.includes(branch.id))
      : allBranches;
  const requestedBranchId = sp.branch && sp.branch !== "" ? sp.branch : null;
  const selectedBranchId =
    requestedBranchId && canAccessBranch(branchScope, requestedBranchId)
      ? requestedBranchId
      : branchScope.scope_type === "branches"
        ? branches[0]?.id ?? null
        : null;
  const selectedBranchName =
    branches.find((branch) => branch.id === selectedBranchId)?.name ?? null;
  const branchFilterIds = selectedBranchId
    ? [selectedBranchId]
    : branchScope.scope_type === "branches"
      ? branchScope.branch_ids
      : null;

  const instructors = await loadTenantInstructors(tenant.id, {
    branchIds: branchFilterIds,
  });
  const selectedId =
    instructors.find((i) => i.id === sp.instructor)?.id ??
    instructors[0]?.id ??
    null;
  const redirectTo = selectedId
    ? `${BASE}?instructor=${selectedId}${
        selectedBranchId ? `&branch=${selectedBranchId}` : ""
      }`
    : BASE;

  const [weekly, exceptions] = selectedId
    ? await Promise.all([
        loadWeeklyAvailability(supabase, tenant.id, selectedId, {
          branchId: selectedBranchId,
        }),
        loadExceptions(supabase, tenant.id, selectedId, {
          branchId: selectedBranchId,
        }),
      ])
    : [[], []];
  const summary = summarizeAvailability(weekly, exceptions);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Beschikbaarheid
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer per instructeur het wekelijkse beschikbaarheidsschema en
          uitzonderingen. Tijden worden in Europe/Amsterdam gebruikt door de
          planning-engine.
        </p>
      </div>

      <BranchScopeSummary
        scope={branchScope}
        selectedBranchName={selectedBranchName}
        branchCount={branches.length}
        sharedRowsLabel="Organisatiebrede beschikbaarheid geldt voor alle vestigingen; vestigingsschema's verfijnen die scope."
      />

      <BranchFilterChips
        branches={branches}
        selectedBranchId={selectedBranchId}
        allHref={selectedId ? `${BASE}?instructor=${selectedId}` : BASE}
        hrefForBranch={(branchId) =>
          `${BASE}?${new URLSearchParams({
            ...(selectedId ? { instructor: selectedId } : {}),
            branch: branchId,
          }).toString()}`
        }
        allLabel="Organisatiebreed"
      />

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
              <CardTitle>Scope en instructeur</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Beschikbaarheidsscope
                </p>
                <AvailabilityScopePicker
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  selectedInstructorId={selectedId}
                  allowOrganizationWide={branchScope.scope_type === "all"}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Instructeur
                </p>
                <InstructorPicker
                  instructors={instructors}
                  selectedId={selectedId}
                  selectedBranchId={selectedBranchId}
                />
              </div>
            </CardContent>
          </Card>

          {selectedId && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <AvailabilityMetric label="Blokken" value={summary.blockCount} />
                <AvailabilityMetric label="Dagen open" value={summary.activeWeekdays} />
                <AvailabilityMetric
                  label="Uren per week"
                  value={Math.round(summary.weeklyMinutes / 60)}
                />
                <AvailabilityMetric
                  label="Uitzonderingen"
                  value={summary.exceptionCount}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Wekelijks schema</CardTitle>
                </CardHeader>
                <CardContent>
                  <WeeklyEditor
                    key={`weekly-${selectedId}`}
                    initial={weekly}
                    instructorId={selectedId}
                    branchId={selectedBranchId}
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
                    branchId={selectedBranchId}
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

function AvailabilityMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
