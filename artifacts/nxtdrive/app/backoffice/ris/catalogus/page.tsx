import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  Fingerprint,
  Layers3,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { RisManagementNav } from "@/components/ris/RisManagementNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireOrganizationPermission } from "@/lib/organization";
import { loadRisCatalogReview } from "@/lib/ris/catalog-review";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";
import { reviewRisCatalogAction } from "./actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Amsterdam",
});

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

const VALIDATION_LABELS = {
  AWAITING_EXPERT_VALIDATION: "Wacht op deskundige",
  IN_REVIEW: "In beoordeling",
  CHANGES_REQUIRED: "Wijzigingen nodig",
  APPROVED: "Goedgekeurd",
} as const;

const CURRICULUM_LABELS = {
  DRAFT: "Concept",
  AWAITING_EXPERT_VALIDATION: "Wacht op validatie",
  PUBLISHED: "Gepubliceerd",
  RETIRED: "Ingetrokken",
} as const;

const SAVED_MESSAGES: Record<string, string> = {
  approved:
    "De deskundigenbeoordeling is digitaal ondertekend en aan deze catalogushash gekoppeld.",
  changes:
    "De gevraagde wijzigingen zijn vastgelegd. De catalogus blijft ongepubliceerd.",
  review: "De catalogus staat nu formeel in beoordeling.",
};

function statusVariant(
  status: string | null,
): "success" | "warning" | "danger" | "info" | "outline" {
  if (status === "APPROVED" || status === "PUBLISHED") return "success";
  if (status === "CHANGES_REQUIRED") return "danger";
  if (status === "IN_REVIEW") return "info";
  if (status === "RETIRED") return "outline";
  return "warning";
}

function GateRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/15 p-3">
      {ok ? (
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-success"
          aria-hidden
        />
      ) : (
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          aria-hidden
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border/80 bg-card/70">
      <CardContent className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function RisCatalogusPage({
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
  const review = await loadRisCatalogReview(
    service,
    context.organization.id,
    sp.version,
  );
  const isPlatformAdmin = context.user.profile?.is_platform_admin === true;
  const validationStatus =
    review.validation?.status ?? "AWAITING_EXPERT_VALIDATION";
  const exportHref = `/api/backoffice/ris/catalogus/export?version=${encodeURIComponent(
    review.selectedVersion.id,
  )}`;
  const releaseGateRows = [
    {
      ok: review.releaseGate.catalogContentComplete,
      label: "Catalogusstructuur compleet",
      detail: "Exact vier modules, 46 actieve scripts en N plus stappen 1–8.",
    },
    {
      ok: review.releaseGate.validationMatchesCurrentHash,
      label: "Actuele deskundigenvalidatie",
      detail:
        "Een ondertekende beoordeling moet exact overeenkomen met de getoonde SHA-256-hash.",
    },
    {
      ok: review.releaseGate.readinessPolicyPublished,
      label: "Readinessbeleid gepubliceerd",
      detail:
        "Beheersing, dekking, veiligheid, stabiliteit en randvoorwaarden blijven een afzonderlijk beleidsdocument.",
    },
    {
      ok:
        review.releaseGate.moduleOneDefinitionPublished &&
        review.releaseGate.moduleTwoDefinitionPublished,
      label: "Moduletoetsdefinities gepubliceerd",
      detail:
        "Module 1 en module 2 moeten beide een gevalideerde definitie hebben.",
    },
    {
      ok: review.releaseGate.curriculumPublished,
      label: "Curriculum gepubliceerd",
      detail:
        "Publicatie volgt pas wanneer catalogus, beleid en toetsdefinities alle releasegates doorstaan.",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <Link
            href="/backoffice/ris"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar RIS-overzicht
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">
            <BookMarked className="h-3.5 w-3.5" aria-hidden />
            Versieerbare bron
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              RIS-catalogus
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Bekijk alle modules, scripts, varianten en instructiestappen.
              Iedere deskundigenbeoordeling is aan één onveranderlijke
              inhoudshash gekoppeld.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <form method="get" className="min-w-64 space-y-1">
            <Label htmlFor="version">Catalogusversie</Label>
            <select
              id="version"
              name="version"
              defaultValue={review.selectedVersion.id}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {review.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name}
                  {version.isActive ? " · actief" : ""}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Versie openen
            </Button>
          </form>
          <a
            href={exportHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" aria-hidden />
            Validatiepakket
          </a>
        </div>
      </header>

      <RisManagementNav
        active="catalogus"
        versionId={review.selectedVersion.id}
      />

      {sp.saved && SAVED_MESSAGES[sp.saved] ? (
        <Card className="border-success/40 bg-success/5 p-4 text-sm text-success">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{SAVED_MESSAGES[sp.saved]}</p>
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
          review.releaseGate.releaseReady
            ? "border-success/40 bg-success/5"
            : "border-warning/40 bg-warning/5"
        }
      >
        <CardContent className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            {review.releaseGate.releaseReady ? (
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
                {review.releaseGate.releaseReady
                  ? "RIS-releasepakket is publiceerbaar"
                  : "RIS blijft in legacy-fallback"}
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {review.releaseGate.releaseReady
                  ? "De inhoudelijke releasegates zijn aantoonbaar afgerond. Tenantactivatie blijft een afzonderlijke beheerhandeling."
                  : "Deze pagina maakt de catalogus en menselijke validatie zichtbaar. Een catalogusgoedkeuring publiceert niet stilzwijgend readinessbeleid of toetslogica."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={statusVariant(validationStatus)}>
              {VALIDATION_LABELS[validationStatus]}
            </Badge>
            <Badge variant={statusVariant(review.curriculum?.status ?? null)}>
              {review.curriculum
                ? CURRICULUM_LABELS[review.curriculum.status]
                : "Geen curriculumrecord"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Modules" value={review.counts.modules} />
        <Stat label="Categorieën" value={review.counts.categories} />
        <Stat label="Scripts" value={review.counts.scripts} />
        <Stat label="Varianten" value={review.counts.variants} />
        <Stat label="Stappen" value={review.counts.steps} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="gap-3 border-b border-border">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{review.selectedVersion.name}</CardTitle>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {review.selectedVersion.description ??
                      "Geen versieomschrijving vastgelegd."}
                  </p>
                </div>
                <Badge
                  variant={
                    review.selectedVersion.isActive ? "success" : "outline"
                  }
                >
                  {review.selectedVersion.isActive
                    ? "Actieve bron"
                    : "Historisch"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span>
                  Geldig vanaf{" "}
                  {dateFmt.format(new Date(review.selectedVersion.activeFrom))}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Fingerprint className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <code className="max-w-full break-all text-foreground">
                    sha256:{review.snapshot.contentHash}
                  </code>
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {review.catalog.tree.map((module, moduleIndex) => {
                const scriptCount = module.categories.reduce(
                  (sum, category) => sum + category.scripts.length,
                  0,
                );
                return (
                  <details
                    key={module.id}
                    open={moduleIndex === 0}
                    className="group overflow-hidden rounded-xl border border-border bg-muted/10"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                          {module.moduleNumber}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {module.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {module.categories.length} categorieën ·{" "}
                            {scriptCount} scripts
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="border-t border-border">
                      {module.description ? (
                        <p className="px-4 py-3 text-sm leading-6 text-muted-foreground">
                          {module.description}
                        </p>
                      ) : null}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th
                                scope="col"
                                className="w-28 px-4 py-3 font-medium"
                              >
                                Code
                              </th>
                              <th
                                scope="col"
                                className="w-48 px-4 py-3 font-medium"
                              >
                                Categorie
                              </th>
                              <th scope="col" className="px-4 py-3 font-medium">
                                Script
                              </th>
                              <th
                                scope="col"
                                className="w-52 px-4 py-3 font-medium"
                              >
                                Varianten
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/70">
                            {module.categories.flatMap((category) =>
                              category.scripts.map((script) => (
                                <tr key={script.id} className="align-top">
                                  <td className="px-4 py-3 font-mono text-xs text-primary">
                                    {script.code}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {category.title}
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-foreground">
                                      {script.title}
                                    </p>
                                    {script.descriptionShort ? (
                                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                        {script.descriptionShort}
                                      </p>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">
                                    {script.variants.length > 0
                                      ? script.variants
                                          .map(
                                            (variant) =>
                                              `${variant.code} · ${variant.title}`,
                                          )
                                          .join(", ")
                                      : "Geen varianten"}
                                  </td>
                                </tr>
                              )),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-primary" aria-hidden />
                Instructiestappen
              </CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Dit is de didactische opbouw. Stappen zijn geen kwaliteitsscores
                en worden niet gemiddeld tot een examenadvies.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-20 px-4 py-3 font-medium">
                        Stap
                      </th>
                      <th scope="col" className="w-56 px-4 py-3 font-medium">
                        Instructeur
                      </th>
                      <th scope="col" className="w-64 px-4 py-3 font-medium">
                        Leerling
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Betekenis
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {review.catalog.steps.map((step) => (
                      <tr key={step.stepValue} className="align-top">
                        <td className="px-4 py-3">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-2 font-semibold text-primary">
                            {step.stepValue}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {step.instructorLabel}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {step.studentLabel}
                        </td>
                        <td className="px-4 py-3 leading-6 text-muted-foreground">
                          {step.explanation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Releasegate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {releaseGateRows.map((row) => (
                  <GateRow key={row.label} {...row} />
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-primary" aria-hidden />
                Deskundigenrecord
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={statusVariant(validationStatus)}>
                  {VALIDATION_LABELS[validationStatus]}
                </Badge>
              </div>
              {review.validation ? (
                <>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Beoordelaar
                      </dt>
                      <dd className="mt-0.5 text-foreground">
                        {review.validation.reviewerName ??
                          review.validation.reviewerEmail ??
                          "Nog niet toegewezen"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Bevoegdheid
                      </dt>
                      <dd className="mt-0.5 leading-5 text-foreground">
                        {review.validation.reviewerCredentials ??
                          "Nog niet vastgelegd"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Laatste wijziging
                      </dt>
                      <dd className="mt-0.5 text-foreground">
                        {dateTimeFmt.format(
                          new Date(
                            review.validation.signedAt ??
                              review.validation.updatedAt,
                          ),
                        )}
                      </dd>
                    </div>
                  </dl>
                  {review.validation.limitationNote ? (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                      <p className="text-xs font-medium text-warning">
                        Beperkingen / wijzigingen
                      </p>
                      <p className="mt-1 leading-5 text-foreground">
                        {review.validation.limitationNote}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="leading-6 text-muted-foreground">
                  Voor deze inhoudshash is nog geen beoordeling vastgelegd.
                </p>
              )}
            </CardContent>
          </Card>

          {isPlatformAdmin && review.validation?.status !== "APPROVED" ? (
            <Card>
              <CardHeader>
                <CardTitle>Beoordeling registreren</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Alleen invullen door of namens een aantoonbaar bevoegde
                  RIS-deskundige. De app kan die inhoudelijke bevoegdheid niet
                  zelfstandig vaststellen.
                </p>
              </CardHeader>
              <CardContent>
                <form action={reviewRisCatalogAction} className="space-y-5">
                  <input
                    type="hidden"
                    name="ris_version_id"
                    value={review.selectedVersion.id}
                  />
                  <input
                    type="hidden"
                    name="content_hash"
                    value={review.snapshot.contentHash}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="reviewer_credentials">
                      Bevoegdheid en kwalificatie
                    </Label>
                    <Input
                      id="reviewer_credentials"
                      name="reviewer_credentials"
                      maxLength={500}
                      defaultValue={
                        review.validation?.reviewerCredentials ?? ""
                      }
                      placeholder="Bijv. RIS-docent, certificaat/registratie en organisatie"
                    />
                  </div>
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium text-foreground">
                      Gecontroleerde onderdelen
                    </legend>
                    {[
                      [
                        "catalog_structure",
                        "Vier modules en 46 actieve scripts.",
                      ],
                      [
                        "script_content",
                        "Benamingen, omschrijvingen en varianten.",
                      ],
                      ["step_content", "N en de didactische stappen 1–8."],
                      [
                        "module_test_logic",
                        "Relatie met moduletoetsen en CBR-momenten.",
                      ],
                      ["source_rights", "Bronvermelding en gebruiksrechten."],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm leading-5 text-foreground"
                      >
                        <input
                          type="checkbox"
                          name={`scenario_${key}`}
                          defaultChecked={review.validation?.scenarioResults.some(
                            (scenario) =>
                              scenario.key === key && scenario.passed,
                          )}
                          className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--primary)]"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="space-y-2">
                    <Label htmlFor="limitation_note">
                      Bevindingen, beperkingen of benodigde wijzigingen
                    </Label>
                    <Textarea
                      id="limitation_note"
                      name="limitation_note"
                      maxLength={3000}
                      defaultValue={review.validation?.limitationNote ?? ""}
                      rows={4}
                      placeholder="Leg afwijkingen en beperkingen expliciet vast."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="change_note">Publicatienotitie</Label>
                    <Input
                      id="change_note"
                      name="change_note"
                      maxLength={1000}
                      defaultValue={review.curriculum?.changeNote ?? ""}
                      placeholder="Korte toelichting op deze catalogusversie"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="approval_confirmation">
                      Digitale ondertekening
                    </Label>
                    <Input
                      id="approval_confirmation"
                      name="approval_confirmation"
                      maxLength={80}
                      autoComplete="off"
                      placeholder="RIS CATALOGUS GOEDGEKEURD"
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      Alleen nodig voor goedkeuren; typ de tekst exact over.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Button type="submit" name="decision" value="APPROVED">
                      Catalogus goedkeuren
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
                      Markeren als in beoordeling
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/80 bg-muted/10">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <LockKeyhole
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="text-sm leading-6 text-muted-foreground">
                    {review.validation?.status === "APPROVED"
                      ? "Een goedgekeurd deskundigenrecord is onveranderlijk. Inhoudswijzigingen vereisen een nieuwe catalogusversie en nieuwe hash."
                      : "De catalogus is voor backofficegebruikers inzichtelijk. Alleen een platformbeheerder kan een deskundigenrecord vastleggen."}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
