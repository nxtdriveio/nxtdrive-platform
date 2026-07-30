import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
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
  configureRisAssessmentDefinitionAction,
  initializeRisAssessmentDefinitionsAction,
  publishRisAssessmentDefinitionAction,
  reviewRisAssessmentDefinitionAction,
} from "../management-actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "definitions-initialized":
    "De moduletoetsdefinities zijn als concept aangemaakt.",
  "definition-configured":
    "De toetsdefinitie is opgeslagen en aan een nieuwe hash gekoppeld.",
  "definition-approved": "De toetsdefinitie is goedgekeurd.",
  "definition-changes": "De benodigde toetswijzigingen zijn vastgelegd.",
  "definition-review": "De toetsdefinitie staat in beoordeling.",
  "definition-published": "De toetsdefinitie is gepubliceerd.",
};

const REVIEW_SCENARIOS = [
  [
    "criteria_coverage",
    "Alle scripts van de module zijn als criterium gedekt.",
  ],
  [
    "safety_criteria",
    "Veiligheidskritieke criteria zijn expliciet gemarkeerd.",
  ],
  [
    "decision_rules",
    "Beslisregels maskeren geen blokkades of ontbrekend bewijs.",
  ],
  [
    "student_feedback",
    "Publicatie en leerlingfeedback zijn inhoudelijk passend.",
  ],
  [
    "source_alignment",
    "Definitie en bron-/gebruiksrechten zijn gecontroleerd.",
  ],
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
    }[status ?? ""] ?? "Onbekend"
  );
}

export default async function RisAssessmentDefinitionsPage({
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
  const { catalog, assessments } = management;
  const isPlatformAdmin = context.user.profile?.is_platform_admin === true;
  const curriculumId = catalog.curriculum?.id ?? null;

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
            RIS-moduletoetsdefinities
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Beheer de criteria voor module 1 en 2. De criteria volgen de
            catalogusscripts; veiligheidskritieke onderdelen moeten expliciet
            worden aangewezen en afzonderlijk gevalideerd.
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
        active="toetsdefinities"
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

      {assessments.length < 2 && curriculumId && isPlatformAdmin ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">
                Moduletoetsconcepten ontbreken
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Maak definities aan op basis van de actuele scripts van module 1
                en 2.
              </p>
            </div>
            <form action={initializeRisAssessmentDefinitionsAction}>
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
              <Button type="submit">
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                Toetsdefinities aanmaken
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {assessments.map((definition) => {
          const criticalCodes = new Set(
            definition.criteria
              .filter((criterion) => criterion.safetyCritical)
              .map((criterion) => criterion.scriptCode),
          );
          const validationStatus =
            definition.validation?.status ?? "AWAITING_EXPERT_VALIDATION";
          const configurationLocked =
            definition.status === "PUBLISHED" ||
            definition.validationMatchesCurrentHash;
          const suffix = `module-${definition.moduleNumber}`;
          return (
            <Card key={definition.id} className="min-w-0">
              <CardHeader className="border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Module {definition.moduleNumber}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {definition.criteria.length} verplichte criteria ·{" "}
                      {criticalCodes.size} veiligheidskritiek
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={statusVariant(definition.status)}>
                      {statusLabel(definition.status)}
                    </Badge>
                    <Badge variant={statusVariant(validationStatus)}>
                      {statusLabel(validationStatus)}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-start gap-2 pt-2 text-xs">
                  <Fingerprint
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                    aria-hidden
                  />
                  <code className="break-all text-muted-foreground">
                    sha256:{definition.contentHash}
                  </code>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-5">
                <form
                  action={configureRisAssessmentDefinitionAction}
                  className="space-y-4"
                >
                  <input
                    type="hidden"
                    name="ris_version_id"
                    value={catalog.selectedVersion.id}
                  />
                  <input
                    type="hidden"
                    name="definition_id"
                    value={definition.id}
                  />
                  <fieldset
                    disabled={!isPlatformAdmin || configurationLocked}
                    className="space-y-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Veiligheidskritieke criteria
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Alle criteria zijn verplicht. Selecteer minimaal één
                        onderdeel dat nooit door een gemiddelde mag worden
                        gecompenseerd.
                      </p>
                    </div>
                    <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="w-24 px-3 py-2 font-medium">Code</th>
                            <th className="px-3 py-2 font-medium">Criterium</th>
                            <th className="w-28 px-3 py-2 text-center font-medium">
                              Kritiek
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {definition.criteria.map((criterion) => (
                            <tr key={criterion.criterionId}>
                              <td className="px-3 py-2 font-mono text-xs text-primary">
                                {criterion.scriptCode}
                              </td>
                              <td className="px-3 py-2 text-foreground">
                                {criterion.label}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  name="safety_critical_code"
                                  value={criterion.scriptCode}
                                  defaultChecked={criticalCodes.has(
                                    criterion.scriptCode,
                                  )}
                                  aria-label={`${criterion.scriptCode} veiligheidskritiek`}
                                  className="h-4 w-4 accent-[var(--primary)]"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`change-note-${suffix}`}>
                        Wijzigingsnotitie
                      </Label>
                      <Textarea
                        id={`change-note-${suffix}`}
                        name="change_note"
                        rows={2}
                        maxLength={1000}
                        defaultValue={definition.changeNote ?? ""}
                      />
                    </div>
                    <Button type="submit" variant="secondary">
                      <Save className="h-4 w-4" aria-hidden />
                      Definitie opslaan
                    </Button>
                  </fieldset>
                </form>

                {isPlatformAdmin &&
                definition.status !== "PUBLISHED" &&
                !definition.validationMatchesCurrentHash ? (
                  <form
                    action={reviewRisAssessmentDefinitionAction}
                    className="space-y-4 border-t border-border pt-5"
                  >
                    <input
                      type="hidden"
                      name="ris_version_id"
                      value={catalog.selectedVersion.id}
                    />
                    <input
                      type="hidden"
                      name="definition_id"
                      value={definition.id}
                    />
                    <input
                      type="hidden"
                      name="content_hash"
                      value={definition.contentHash}
                    />
                    <div>
                      <p className="font-medium text-foreground">
                        Deskundigenbeoordeling
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Beoordeel alleen de getoonde hash en criteria.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`credentials-${suffix}`}>
                        Deskundigenkwalificatie
                      </Label>
                      <Input
                        id={`credentials-${suffix}`}
                        name="reviewer_credentials"
                        maxLength={500}
                        defaultValue={
                          definition.validation?.reviewerCredentials ?? ""
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
                            defaultChecked={definition.validation?.scenarioResults.some(
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
                      <Label htmlFor={`limitations-${suffix}`}>
                        Bevindingen of wijzigingen
                      </Label>
                      <Textarea
                        id={`limitations-${suffix}`}
                        name="limitation_note"
                        rows={3}
                        maxLength={3000}
                        defaultValue={
                          definition.validation?.limitationNote ?? ""
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`approval-${suffix}`}>
                        Digitale ondertekening
                      </Label>
                      <Input
                        id={`approval-${suffix}`}
                        name="approval_confirmation"
                        placeholder="TOETSDEFINITIE GOEDGEKEURD"
                        autoComplete="off"
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button type="submit" name="decision" value="APPROVED">
                        Goedkeuren
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="CHANGES_REQUIRED"
                        variant="danger"
                      >
                        Wijzigingen
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="IN_REVIEW"
                        variant="secondary"
                      >
                        In beoordeling
                      </Button>
                    </div>
                  </form>
                ) : null}

                {isPlatformAdmin &&
                definition.validationMatchesCurrentHash &&
                definition.status !== "PUBLISHED" ? (
                  <form
                    action={publishRisAssessmentDefinitionAction}
                    className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-4"
                  >
                    <input
                      type="hidden"
                      name="ris_version_id"
                      value={catalog.selectedVersion.id}
                    />
                    <input
                      type="hidden"
                      name="definition_id"
                      value={definition.id}
                    />
                    <p className="flex items-center gap-2 font-medium text-success">
                      <ShieldCheck className="h-4 w-4" aria-hidden />
                      Definitie is gevalideerd
                    </p>
                    <Label htmlFor={`publication-${suffix}`}>
                      Typ TOETSDEFINITIE PUBLICEREN
                    </Label>
                    <Input
                      id={`publication-${suffix}`}
                      name="publication_confirmation"
                      autoComplete="off"
                    />
                    <Button type="submit">Definitie publiceren</Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {assessments.length === 0 && !isPlatformAdmin ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Er zijn nog geen moduletoetsdefinities. Alleen een platformbeheerder
          kan deze aanmaken.
        </Card>
      ) : null}
    </div>
  );
}
