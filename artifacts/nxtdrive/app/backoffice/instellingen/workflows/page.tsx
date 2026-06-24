import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Gauge,
  ListChecks,
  Sparkles,
  Workflow,
} from "lucide-react";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_TEMPLATE_CATALOG,
  loadTenantWorkflowCatalogSettings,
  workflowCatalogSummary,
  type WorkflowCategory,
} from "@/lib/tenant/workflow-catalog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowTemplateCatalogManager } from "./workflow-template-catalog-manager";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<WorkflowCategory, string> = {
  instroom: "Instroom",
  planning: "Planning",
  finance: "Finance",
  kwaliteit: "Kwaliteit",
  dossier: "Dossier",
  communicatie: "Communicatie",
};

export default async function TenantWorkflowCatalogPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const service = createServiceRoleClient();
  const settings = await loadTenantWorkflowCatalogSettings(service, tenant.id);
  const summary = workflowCatalogSummary(settings);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/backoffice/instellingen"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar instellingen
          </Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Workflow builder
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Templatecatalogus
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Richt standaardprocessen in voor {tenant.name}. Kies per workflow of
            NXTDRIVE alleen signaleert, een voorstel maakt of automatisch
            uitvoert binnen de bestaande servervalidaties.
          </p>
        </div>
        <Badge variant="primary" className="w-fit">
          Tenantconfiguratie
        </Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Templates</CardTitle>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <Boxes className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {summary.total}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              beschikbare workflowtemplates
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Actief</CardTitle>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {summary.enabled}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              ingeschakeld voor deze tenant
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Voorstellen</CardTitle>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {summary.suggested}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              actief als voorgestelde flow
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Automatisch</CardTitle>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <Gauge className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {summary.automatic}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              actief met automatische modus
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" aria-hidden />
              Catalogus per procesgebied
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {WORKFLOW_CATEGORIES.map((category) => {
              const item = summary.categories.find((entry) => entry.category === category);
              return (
                <div
                  key={category}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {CATEGORY_LABELS[category]}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item?.enabled ?? 0}/{item?.total ?? 0} actief
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" aria-hidden />
              Werking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Elke template bestaat uit trigger, eigenaar, SLA, communicatiekanalen
              en concrete stappen. Opslaan wijzigt de tenantconfiguratie en wordt
              vastgelegd in de auditlog.
            </p>
            <p>
              Automatische modus betekent niet dat validaties worden overgeslagen:
              planning, finance, RIS en dossierregels blijven altijd leidend.
            </p>
            <p className="font-medium text-foreground">
              {WORKFLOW_TEMPLATE_CATALOG.length} templates klaar voor inrichting.
            </p>
          </CardContent>
        </Card>
      </section>

      <WorkflowTemplateCatalogManager initialSettings={settings} />
    </div>
  );
}

