import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  LockKeyhole,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { RisManagementNav } from "@/components/ris/RisManagementNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { requireOrganizationPermission } from "@/lib/organization";
import {
  canActivateRisAfterMigration,
  loadRisLegacyMigrationReport,
} from "@/lib/ris/migration";
import { loadRisReleaseManagement } from "@/lib/ris/release-management";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";
import {
  activateTenantRisReleaseAction,
  publishRisCurriculumAction,
} from "../management-actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "release-published":
    "Het gevalideerde RIS-curriculum is gepubliceerd. Tenantactivatie blijft een afzonderlijke stap.",
  "tenant-activated":
    "RIS is voor deze tenant geactiveerd. AI-assistentie blijft uitgeschakeld.",
};

function Gate({
  ok,
  title,
  detail,
  href,
}: {
  ok: boolean;
  title: string;
  detail: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-3">
      {ok ? (
        <CheckCircle2
          className="mt-0.5 h-5 w-5 shrink-0 text-success"
          aria-hidden
        />
      ) : (
        <CircleDashed
          className="mt-0.5 h-5 w-5 shrink-0 text-warning"
          aria-hidden
        />
      )}
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
  return (
    <li className="rounded-xl border border-border bg-muted/10 p-4">
      {href && !ok ? (
        <Link href={href} className="block hover:opacity-90">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

export default async function RisReleasePage({
  searchParams,
}: {
  searchParams?: Promise<{
    version?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const context = await requireOrganizationPermission("student:read", {
    allowedRoles: [...STUDENT_BACKOFFICE_READ_ROLES],
  });
  const service = createServiceRoleClient();
  const [management, migrationReport] = await Promise.all([
    loadRisReleaseManagement(service, context.organization.id, sp.version),
    loadRisLegacyMigrationReport(service, context.organization.id),
  ]);
  const { catalog, release } = management;
  const isPlatformAdmin = context.user.profile?.is_platform_admin === true;
  const versionQuery = `version=${encodeURIComponent(catalog.selectedVersion.id)}`;
  const migrationReady = canActivateRisAfterMigration(migrationReport);
  const gates = [
    {
      ok: release.catalogApproved,
      title: "Catalogus deskundig goedgekeurd",
      detail:
        "Vier modules, 46 scripts en instructiestappen horen bij de actuele hash.",
      href: `/backoffice/ris/catalogus?${versionQuery}`,
    },
    {
      ok: release.policyApproved,
      title: "Readinessbeleid deskundig goedgekeurd",
      detail:
        "Dekking, beheersing, veiligheid, stabiliteit en randvoorwaarden zijn gevalideerd.",
      href: `/backoffice/ris/beleid?${versionQuery}`,
    },
    {
      ok: release.policyPublished,
      title: "Readinessbeleid gepubliceerd",
      detail:
        "Alleen het gevalideerde en onveranderlijke beleidsdocument mag actief worden gebruikt.",
      href: `/backoffice/ris/beleid?${versionQuery}`,
    },
    {
      ok: release.moduleOnePublished,
      title: "Module 1-toetsdefinitie gepubliceerd",
      detail: "De criteria en veiligheidskritieke onderdelen zijn gevalideerd.",
      href: `/backoffice/ris/toetsdefinities?${versionQuery}`,
    },
    {
      ok: release.moduleTwoPublished,
      title: "Module 2-toetsdefinitie gepubliceerd",
      detail: "De criteria en veiligheidskritieke onderdelen zijn gevalideerd.",
      href: `/backoffice/ris/toetsdefinities?${versionQuery}`,
    },
    {
      ok: migrationReady,
      title: "Legacy-migratiecontrole gereed",
      detail:
        migrationReport.blockingReasons.join(" ") ||
        "Bestaande scores en mappings blokkeren de overgang niet.",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/backoffice/ris"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar RIS-overzicht
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            RIS-releasebeheer
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Publiceer pas wanneer de catalogus, het readinessbeleid en beide
            moduletoetsdefinities aantoonbaar zijn gevalideerd. Activeer daarna
            RIS afzonderlijk per tenant.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={release.curriculumPublished ? "success" : "warning"}>
            Curriculum:{" "}
            {release.curriculumPublished ? "gepubliceerd" : "geblokkeerd"}
          </Badge>
          <Badge variant={release.tenantActive ? "success" : "outline"}>
            Tenant: {release.tenantActive ? "RIS actief" : "legacy"}
          </Badge>
        </div>
      </header>

      <RisManagementNav
        active="release"
        versionId={catalog.selectedVersion.id}
      />

      {sp.saved && MESSAGES[sp.saved] ? (
        <Card className="border-success/40 bg-success/5 p-4 text-sm text-success">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{MESSAGES[sp.saved]}</p>
          </div>
        </Card>
      ) : null}
      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{sp.error}</p>
          </div>
        </Card>
      ) : null}

      <Card
        className={
          release.tenantActive
            ? "border-success/40 bg-success/5"
            : "border-warning/40 bg-warning/5"
        }
      >
        <CardContent className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            {release.tenantActive ? (
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-success"
                aria-hidden
              />
            ) : (
              <LockKeyhole
                className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                aria-hidden
              />
            )}
            <div>
              <p className="font-semibold text-foreground">
                {release.tenantActive
                  ? "RIS is operationeel voor deze tenant"
                  : "RIS blijft veilig in legacy-fallback"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Catalogusversie {catalog.selectedVersion.name}. AI-assistentie
                blijft platformbreed gedeactiveerd.
              </p>
            </div>
          </div>
          <Badge variant={migrationReady ? "success" : "warning"}>
            Migratie: {migrationReport.readiness}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.45fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Inhoudelijke releasegates</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {gates.map((gate) => (
                <Gate key={gate.title} {...gate} />
              ))}
            </ol>
          </CardContent>
        </Card>

        <aside className="space-y-6 xl:sticky xl:top-6">
          {!release.curriculumPublished ? (
            <Card
              className={
                release.readyToPublishCurriculum
                  ? "border-success/40 bg-success/5"
                  : "border-border bg-muted/10"
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" aria-hidden />
                  Curriculum publiceren
                </CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Deze stap maakt exact de gevalideerde catalogushash
                  publiceerbaar. Bestaande gepubliceerde RIS-versies worden
                  ingetrokken, niet overschreven.
                </p>
              </CardHeader>
              <CardContent>
                {release.readyToPublishCurriculum &&
                catalog.curriculum &&
                isPlatformAdmin ? (
                  <form
                    action={publishRisCurriculumAction}
                    className="space-y-3"
                  >
                    <input
                      type="hidden"
                      name="ris_version_id"
                      value={catalog.selectedVersion.id}
                    />
                    <input
                      type="hidden"
                      name="curriculum_version_id"
                      value={catalog.curriculum.id}
                    />
                    <Label htmlFor="publication_confirmation">
                      Typ RIS RELEASE PUBLICEREN
                    </Label>
                    <Input
                      id="publication_confirmation"
                      name="publication_confirmation"
                      autoComplete="off"
                    />
                    <Button type="submit">RIS-curriculum publiceren</Button>
                  </form>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Rond eerst alle bovenstaande inhoudelijke gates af.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {release.curriculumPublished && !release.tenantActive ? (
            <Card
              className={
                migrationReady
                  ? "border-success/40 bg-success/5"
                  : "border-warning/40 bg-warning/5"
              }
            >
              <CardHeader>
                <CardTitle>RIS voor tenant activeren</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Activeert RIS voor {context.organization.name}. Deze handeling
                  wijzigt geen historische beoordelingen.
                </p>
              </CardHeader>
              <CardContent>
                {migrationReady && isPlatformAdmin ? (
                  <form
                    action={activateTenantRisReleaseAction}
                    className="space-y-3"
                  >
                    <input
                      type="hidden"
                      name="ris_version_id"
                      value={catalog.selectedVersion.id}
                    />
                    <Label htmlFor="activation_confirmation">
                      Typ RIS VOOR TENANT ACTIVEREN
                    </Label>
                    <Input
                      id="activation_confirmation"
                      name="activation_confirmation"
                      autoComplete="off"
                    />
                    <Button type="submit">RIS activeren</Button>
                  </form>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {migrationReport.blockingReasons.join(" ") ||
                      "Alleen een platformbeheerder kan RIS activeren."}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {!isPlatformAdmin ? (
            <Card className="bg-muted/10">
              <CardContent className="pt-5 text-sm leading-6 text-muted-foreground">
                Alleen platformbeheerders kunnen publiceren en tenantactivatie
                uitvoeren.
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
