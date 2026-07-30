import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Fingerprint,
  Save,
  ShieldCheck,
} from "lucide-react";
import { RisManagementNav } from "@/components/ris/RisManagementNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireOrganizationPermission } from "@/lib/organization";
import { loadRisReleaseManagement } from "@/lib/ris/release-management";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";
import {
  configureRisReadinessPolicyAction,
  publishRisReadinessPolicyAction,
  reviewRisReadinessPolicyAction,
} from "../management-actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "policy-configured":
    "Het readinessbeleid is opgeslagen en aan een nieuwe inhoudshash gekoppeld.",
  "policy-approved": "Het readinessbeleid is door de deskundige goedgekeurd.",
  "policy-changes": "De benodigde beleidswijzigingen zijn vastgelegd.",
  "policy-review": "Het readinessbeleid staat in beoordeling.",
  "policy-published": "Het readinessbeleid is gepubliceerd.",
};

const REVIEW_SCENARIOS = [
  [
    "separate_dimensions",
    "Beheersing en dekking zijn afzonderlijk beoordeeld.",
  ],
  ["critical_safety", "Kritieke veiligheid kan niet worden gecompenseerd."],
  ["prerequisites", "Theorie, verklaring en machtiging zijn gecontroleerd."],
  ["stability", "Stabiliteit en terugval zijn over meerdere lessen geborgd."],
  ["explainability", "Elk advies blijft uitlegbaar zonder examenclaim."],
] as const;

function statusVariant(status: string | null) {
  if (status === "PUBLISHED" || status === "APPROVED")
    return "success" as const;
  if (status === "CHANGES_REQUIRED") return "danger" as const;
  if (status === "IN_REVIEW") return "info" as const;
  return "warning" as const;
}

function statusLabel(status: string | null) {
  return (
    {
      DRAFT: "Concept",
      AWAITING_EXPERT_VALIDATION: "Wacht op deskundige",
      PUBLISHED: "Gepubliceerd",
      RETIRED: "Ingetrokken",
      IN_REVIEW: "In beoordeling",
      CHANGES_REQUIRED: "Wijzigingen nodig",
      APPROVED: "Goedgekeurd",
    }[status ?? ""] ?? "Nog niet aangemaakt"
  );
}

export default async function RisReadinessPolicyPage({
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
  const management = await loadRisReleaseManagement(
    createServiceRoleClient(),
    context.organization.id,
    sp.version,
  );
  const { catalog, policy } = management;
  const isPlatformAdmin = context.user.profile?.is_platform_admin === true;
  const curriculumId = catalog.curriculum?.id ?? null;
  const criticalIds = new Set(
    policy?.rules
      .filter((rule) => rule.critical)
      .map((rule) => rule.competencyId) ?? [],
  );
  const defaults = policy?.rules[0] ?? {
    minimumEvidenceCount: 2,
    minimumContextCount: 2,
    maximumEvidenceAgeDays: 90,
    stabilityWindow: 3,
    minimumStableObservations: 2,
  };
  const validationStatus =
    policy?.validation?.status ?? "AWAITING_EXPERT_VALIDATION";
  const configurationLocked =
    policy?.status === "PUBLISHED" || policy?.validationMatchesCurrentHash;

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
            RIS-readinessbeleid
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Leg dekking, beheersing, veiligheid, stabiliteit en randvoorwaarden
            afzonderlijk vast. Dit beleid geeft beslisondersteuning en nooit
            zelfstandig een formeel CBR-examenadvies.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="version">Catalogusversie</Label>
            <select
              id="version"
              name="version"
              defaultValue={catalog.selectedVersion.id}
              className="h-10 min-w-64 rounded-md border border-border bg-background px-3 text-sm"
            >
              {catalog.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Openen
          </Button>
        </form>
      </header>

      <RisManagementNav
        active="beleid"
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Beleidsstatus
            </p>
            <Badge
              className="mt-2"
              variant={statusVariant(policy?.status ?? null)}
            >
              {statusLabel(policy?.status ?? null)}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Deskundigenstatus
            </p>
            <Badge className="mt-2" variant={statusVariant(validationStatus)}>
              {statusLabel(validationStatus)}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Kritieke scripts
            </p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {criticalIds.size}
            </p>
          </CardContent>
        </Card>
      </div>

      {!curriculumId ? (
        <Card className="border-danger/40 bg-danger/5 p-5 text-sm text-danger">
          Voor deze catalogus ontbreekt een curriculumversie.
        </Card>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.42fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Beleidsparameters en kritieke competenties</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Alle 46 scripts blijven afzonderlijke competenties. Selecteer
                expliciet welke onderdelen veiligheidskritiek zijn; minimaal één
                selectie is nodig voor goedkeuring.
              </p>
            </CardHeader>
            <CardContent>
              {configurationLocked ? (
                <div className="mb-5 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
                  De actuele hash is goedgekeurd of gepubliceerd. Wijzigen
                  vereist een nieuwe beleids- en validatiecyclus.
                </div>
              ) : null}
              <form
                action={configureRisReadinessPolicyAction}
                className="space-y-6"
              >
                <input
                  type="hidden"
                  name="ris_version_id"
                  value={catalog.selectedVersion.id}
                />
                <input
                  type="hidden"
                  name="curriculum_version_id"
                  value={curriculumId}
                />
                <fieldset disabled={!isPlatformAdmin || configurationLocked}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="minimum_evidence_count">
                        Minimum bewijs
                      </Label>
                      <Input
                        id="minimum_evidence_count"
                        name="minimum_evidence_count"
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={defaults.minimumEvidenceCount}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="minimum_context_count">
                        Minimum contexten
                      </Label>
                      <Input
                        id="minimum_context_count"
                        name="minimum_context_count"
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={defaults.minimumContextCount}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="stability_window">
                        Stabiliteitsvenster
                      </Label>
                      <Input
                        id="stability_window"
                        name="stability_window"
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={defaults.stabilityWindow}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="minimum_stable_observations">
                        Stabiele observaties
                      </Label>
                      <Input
                        id="minimum_stable_observations"
                        name="minimum_stable_observations"
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={defaults.minimumStableObservations}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="maximum_evidence_age_days">
                        Bewijsleeftijd
                      </Label>
                      <Input
                        id="maximum_evidence_age_days"
                        name="maximum_evidence_age_days"
                        type="number"
                        min={1}
                        max={365}
                        defaultValue={defaults.maximumEvidenceAgeDays}
                      />
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {catalog.catalog.tree.map((module) => (
                      <div
                        key={module.id}
                        className="overflow-hidden rounded-xl border border-border"
                      >
                        <div className="border-b border-border bg-muted/30 px-4 py-3">
                          <p className="font-medium text-foreground">
                            Module {module.moduleNumber} · {module.title}
                          </p>
                        </div>
                        <div className="grid gap-px bg-border sm:grid-cols-2">
                          {module.categories.flatMap((category) =>
                            category.scripts.map((script) => (
                              <label
                                key={script.id}
                                className="flex cursor-pointer items-start gap-3 bg-card p-3 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  name="critical_competency_id"
                                  value={script.code}
                                  defaultChecked={criticalIds.has(script.code)}
                                  className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                                />
                                <span>
                                  <span className="font-mono text-xs text-primary">
                                    {script.code}
                                  </span>
                                  <span className="ml-2 text-foreground">
                                    {script.title}
                                  </span>
                                </span>
                              </label>
                            )),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 space-y-2">
                    <Label htmlFor="change_note">Wijzigingsnotitie</Label>
                    <Textarea
                      id="change_note"
                      name="change_note"
                      rows={3}
                      maxLength={1000}
                      defaultValue={policy?.changeNote ?? ""}
                    />
                  </div>
                  <Button type="submit" className="mt-4">
                    <Save className="h-4 w-4" aria-hidden />
                    Beleid als concept opslaan
                  </Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>

          <aside className="space-y-6 xl:sticky xl:top-6">
            {policy ? (
              <Card>
                <CardHeader>
                  <CardTitle>Actuele beleidshash</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 text-xs">
                    <Fingerprint
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <code className="break-all text-foreground">
                      sha256:{policy.contentHash}
                    </code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Engine {policy.engineVersion} · {policy.rules.length} regels
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {policy &&
            isPlatformAdmin &&
            policy.status !== "PUBLISHED" &&
            !policy.validationMatchesCurrentHash ? (
              <Card>
                <CardHeader>
                  <CardTitle>Deskundigenbeoordeling</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Controleer de opgeslagen hash. De beoordelaar moet relevante
                    RIS- én toetsdeskundigheid kunnen onderbouwen.
                  </p>
                </CardHeader>
                <CardContent>
                  <form
                    action={reviewRisReadinessPolicyAction}
                    className="space-y-4"
                  >
                    <input
                      type="hidden"
                      name="ris_version_id"
                      value={catalog.selectedVersion.id}
                    />
                    <input type="hidden" name="policy_id" value={policy.id} />
                    <input
                      type="hidden"
                      name="content_hash"
                      value={policy.contentHash}
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor="reviewer_credentials">
                        Deskundigenkwalificatie
                      </Label>
                      <Input
                        id="reviewer_credentials"
                        name="reviewer_credentials"
                        maxLength={500}
                        defaultValue={
                          policy.validation?.reviewerCredentials ?? ""
                        }
                      />
                    </div>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">
                        Gecontroleerde scenario’s
                      </legend>
                      {REVIEW_SCENARIOS.map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm leading-5"
                        >
                          <input
                            type="checkbox"
                            name={`scenario_${key}`}
                            defaultChecked={policy.validation?.scenarioResults.some(
                              (scenario) =>
                                scenario.key === key && scenario.passed,
                            )}
                            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="space-y-1.5">
                      <Label htmlFor="limitation_note">
                        Bevindingen of wijzigingen
                      </Label>
                      <Textarea
                        id="limitation_note"
                        name="limitation_note"
                        rows={3}
                        maxLength={3000}
                        defaultValue={policy.validation?.limitationNote ?? ""}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="approval_confirmation">
                        Digitale ondertekening
                      </Label>
                      <Input
                        id="approval_confirmation"
                        name="approval_confirmation"
                        placeholder="READINESSBELEID GOEDGEKEURD"
                        autoComplete="off"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Button type="submit" name="decision" value="APPROVED">
                        Beleid goedkeuren
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="CHANGES_REQUIRED"
                        variant="danger"
                      >
                        Wijzigingen vereisen
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="IN_REVIEW"
                        variant="secondary"
                      >
                        In beoordeling zetten
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {policy &&
            isPlatformAdmin &&
            policy.validationMatchesCurrentHash &&
            policy.status !== "PUBLISHED" ? (
              <Card className="border-success/40 bg-success/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
                    Publicatie gereed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    action={publishRisReadinessPolicyAction}
                    className="space-y-3"
                  >
                    <input
                      type="hidden"
                      name="ris_version_id"
                      value={catalog.selectedVersion.id}
                    />
                    <input type="hidden" name="policy_id" value={policy.id} />
                    <Label htmlFor="publication_confirmation">
                      Typ READINESSBELEID PUBLICEREN
                    </Label>
                    <Input
                      id="publication_confirmation"
                      name="publication_confirmation"
                      autoComplete="off"
                    />
                    <Button type="submit">Readinessbeleid publiceren</Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {!isPlatformAdmin ? (
              <Card className="bg-muted/10">
                <CardContent className="pt-5 text-sm leading-6 text-muted-foreground">
                  Alleen platformbeheerders kunnen beleid configureren,
                  goedkeuren en publiceren.
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
