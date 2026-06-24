import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Flag,
  ListChecks,
  Rocket,
  ShieldCheck,
} from "lucide-react";

import { FranchiseDowngradeAlert } from "@/components/backoffice/franchise-downgrade-alert";
import {
  FranchiseActionLink,
  FranchiseEmptyState,
  FranchiseErrorState,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseProgressBar,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  assignFranchisePlaybookProgram,
  createFranchisePlaybookProgram,
  createFranchisePlaybookStep,
  updateFranchisePlaybookAssignmentStatus,
  updateFranchisePlaybookProgram,
  updateFranchisePlaybookStepProgress,
} from "@/lib/franchise/actions";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import {
  loadFranchisePlaybookOverview,
  type FranchisePlaybookAssignmentStatus,
  type FranchisePlaybookProgramStatus,
  type FranchisePlaybookStepProgressStatus,
} from "@/lib/franchise/playbooks";
import { PLAN_LABELS } from "@/lib/platform/features";

export const dynamic = "force-dynamic";

const CATEGORY_OPTIONS = [
  ["operations", "Operatie"],
  ["planning", "Planning"],
  ["quality", "Kwaliteit"],
  ["sales", "Sales"],
  ["finance", "Finance"],
  ["training", "Training"],
  ["compliance", "Compliance"],
] as const;

const STEP_TYPE_OPTIONS = [
  ["checklist", "Checklist"],
  ["training", "Training"],
  ["rollout", "Rollout"],
  ["coaching", "Coaching"],
  ["audit", "Audit"],
  ["communication", "Communicatie"],
  ["measurement", "Meten"],
] as const;

const ASSIGNMENT_STATUS_OPTIONS: Array<[FranchisePlaybookAssignmentStatus, string]> = [
  ["not_started", "Nog niet gestart"],
  ["in_progress", "In uitvoering"],
  ["blocked", "Geblokkeerd"],
  ["completed", "Afgerond"],
  ["declined", "Afgewezen"],
];

const STEP_PROGRESS_OPTIONS: Array<[FranchisePlaybookStepProgressStatus, string]> = [
  ["not_started", "Nog niet gestart"],
  ["in_progress", "In uitvoering"],
  ["blocked", "Geblokkeerd"],
  ["completed", "Afgerond"],
  ["skipped", "Overgeslagen"],
];

function programTone(status: FranchisePlaybookProgramStatus) {
  if (status === "active") return "success";
  if (status === "archived") return "readonly";
  return "warning";
}

function assignmentTone(status: FranchisePlaybookAssignmentStatus) {
  if (status === "completed") return "success";
  if (status === "blocked" || status === "declined") return "danger";
  if (status === "in_progress") return "delegated";
  return "readonly";
}

function assignmentLabel(status: FranchisePlaybookAssignmentStatus) {
  return ASSIGNMENT_STATUS_OPTIONS.find((option) => option[0] === status)?.[1] ?? status;
}

function categoryLabel(value: string) {
  return CATEGORY_OPTIONS.find((option) => option[0] === value)?.[1] ?? value;
}

export default async function FranchisePlaybookPage() {
  const { tenant, franchiseAccess, readOnlyDowngrade } =
    await requireFranchiseOperator();

  let overview: Awaited<ReturnType<typeof loadFranchisePlaybookOverview>> | null =
    null;
  try {
    overview = await loadFranchisePlaybookOverview(tenant.id);
  } catch (error) {
    console.error("[franchise/playbook] load failed", error);
  }

  if (!overview) {
    return (
      <FranchiseErrorState
        title="Franchise Playbook"
        description={`Het franchiseplaybook kon nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const controlsDisabled = readOnlyDowngrade;

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Templates & playbook"
        title="Playbook programma's"
        description="Beheer franchisebrede programma's met stappen, uitrol naar franchisees, voortgang, check-ins en audit. Dit is het operationele handboek waarmee klanten zelf sturen."
        badges={
          <>
            <FranchiseModeBadge mode="network" />
            <FranchiseStatusBadge tone="success">Klantbeheerbaar</FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/templates">
              Templates
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/governance" variant="primary">
              Governance
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      {readOnlyDowngrade ? (
        <FranchiseDowngradeAlert
          planLabel={PLAN_LABELS[franchiseAccess.requiredPlan]}
        />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FranchiseKpiCard
          label="Programma's"
          value={overview.stats.programsTotal}
          hint="totaal beheerd"
          icon={BookOpenCheck}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Actief"
          value={overview.stats.activePrograms}
          hint="beschikbaar voor uitrol"
          icon={Rocket}
          tone="success"
        />
        <FranchiseKpiCard
          label="Toewijzingen"
          value={overview.stats.assignmentsTotal}
          hint="franchisee programma's"
          icon={ClipboardList}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Afgerond"
          value={`${overview.stats.completionRate}%`}
          hint={`${overview.stats.completedAssignments} afgerond`}
          icon={CheckCircle2}
          tone="success"
        />
        <FranchiseKpiCard
          label="Blokkades"
          value={overview.stats.blockedAssignments}
          hint="vragen opvolging"
          icon={ShieldCheck}
          tone={overview.stats.blockedAssignments > 0 ? "danger" : "readonly"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.38fr]">
        <div className="space-y-4">
          {overview.programs.length === 0 ? (
            <FranchiseEmptyState
              icon={BookOpenCheck}
              title="Nog geen playbookprogramma's"
              description="Maak rechts een eerste programma aan. Daarna kun je stappen toevoegen en het programma uitrollen naar franchisees."
            />
          ) : (
            overview.programs.map((program) => (
              <FranchisePanel
                key={program.id}
                title={program.name}
                description={`${categoryLabel(program.category)} - ${program.cadence} - eigenaar: ${program.owner_label}`}
                contentClassName="space-y-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <FranchiseStatusBadge tone={programTone(program.status)}>
                        {program.status}
                      </FranchiseStatusBadge>
                      <FranchiseStatusBadge tone="info">
                        {program.steps.length} stappen
                      </FranchiseStatusBadge>
                      <FranchiseStatusBadge tone="delegated">
                        {program.assignments.length} franchisees
                      </FranchiseStatusBadge>
                    </div>
                    <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                      {program.objective}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["draft", "active", "archived"] as const).map((status) => (
                      <form key={status} action={updateFranchisePlaybookProgram}>
                        <input type="hidden" name="program_id" value={program.id} />
                        <input type="hidden" name="status" value={status} />
                        <Button
                          type="submit"
                          size="sm"
                          variant={program.status === status ? "primary" : "outline"}
                          disabled={controlsDisabled}
                        >
                          {status}
                        </Button>
                      </form>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-primary" aria-hidden />
                      <h3 className="text-sm font-black text-foreground">
                        Programma stappen
                      </h3>
                    </div>
                    {program.steps.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-brand-border bg-brand-muted p-4 text-sm text-muted-foreground">
                        Voeg minimaal een stap toe voordat je dit programma actief
                        gaat uitrollen.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {program.steps.map((step) => (
                          <article
                            key={step.id}
                            className="rounded-2xl border border-brand-card-border bg-white px-4 py-3"
                          >
                            <div className="flex items-start gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent text-xs font-black text-primary">
                                {step.position}
                              </span>
                              <div className="min-w-0">
                                <p className="font-black text-foreground">
                                  {step.title}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  {step.description || "Geen beschrijving."}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                  <FranchiseStatusBadge tone="info">
                                    {step.step_type}
                                  </FranchiseStatusBadge>
                                  {step.evidence_hint ? (
                                    <FranchiseStatusBadge tone="readonly">
                                      bewijs: {step.evidence_hint}
                                    </FranchiseStatusBadge>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}

                    <form
                      action={createFranchisePlaybookStep}
                      className="rounded-2xl border border-brand-card-border bg-brand-muted p-4"
                    >
                      <input type="hidden" name="program_id" value={program.id} />
                      <div className="grid gap-3 md:grid-cols-[72px_1fr_150px]">
                        <div className="space-y-1.5">
                          <Label htmlFor={`position-${program.id}`}>Nr.</Label>
                          <Input
                            id={`position-${program.id}`}
                            name="position"
                            type="number"
                            min="1"
                            placeholder="#"
                            disabled={controlsDisabled}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`step-title-${program.id}`}>Stap</Label>
                          <Input
                            id={`step-title-${program.id}`}
                            name="title"
                            placeholder="Bijv. Intakecheck uitvoeren"
                            disabled={controlsDisabled}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`step-type-${program.id}`}>Type</Label>
                          <Select
                            id={`step-type-${program.id}`}
                            name="step_type"
                            disabled={controlsDisabled}
                          >
                            {STEP_TYPE_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Textarea
                          name="description"
                          rows={2}
                          placeholder="Wat moet de franchisee concreet doen?"
                          disabled={controlsDisabled}
                        />
                        <Input
                          name="evidence_hint"
                          placeholder="Bewijs of oplevering, optioneel"
                          disabled={controlsDisabled}
                        />
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        className="mt-3"
                        disabled={controlsDisabled}
                      >
                        Stap toevoegen
                      </Button>
                    </form>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-primary" aria-hidden />
                      <h3 className="text-sm font-black text-foreground">
                        Uitrol en check-ins
                      </h3>
                    </div>

                    <form
                      action={assignFranchisePlaybookProgram}
                      className="rounded-2xl border border-brand-card-border bg-brand-muted p-4"
                    >
                      <input type="hidden" name="program_id" value={program.id} />
                      <div className="grid gap-3 md:grid-cols-[1fr_150px]">
                        <Select
                          name="franchisee_tenant_id"
                          disabled={controlsDisabled || overview.franchisees.length === 0}
                          required
                        >
                          <option value="">Kies franchisee...</option>
                          {overview.franchisees.map((franchisee) => (
                            <option key={franchisee.id} value={franchisee.id}>
                              {franchisee.name}
                            </option>
                          ))}
                        </Select>
                        <Input
                          name="due_date"
                          type="date"
                          disabled={controlsDisabled}
                        />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Input
                          name="owner_label"
                          placeholder="Lokale eigenaar"
                          disabled={controlsDisabled}
                        />
                        <Input
                          name="note"
                          placeholder="Korte instructie of context"
                          disabled={controlsDisabled}
                        />
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        className="mt-3"
                        disabled={controlsDisabled}
                      >
                        Programma toewijzen
                      </Button>
                    </form>

                    {program.assignments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-brand-border bg-white p-4 text-sm text-muted-foreground">
                        Nog niet uitgerold naar franchisees.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {program.assignments.map((assignment) => (
                          <article
                            key={assignment.id}
                            className="rounded-2xl border border-brand-card-border bg-white p-4"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-black text-foreground">
                                    {assignment.franchisee_name}
                                  </p>
                                  <FranchiseStatusBadge
                                    tone={assignmentTone(assignment.status)}
                                  >
                                    {assignmentLabel(assignment.status)}
                                  </FranchiseStatusBadge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {assignment.owner_label}
                                  {assignment.due_date
                                    ? ` - deadline ${assignment.due_date}`
                                    : ""}
                                </p>
                              </div>
                              <div className="min-w-[170px]">
                                <FranchiseProgressBar
                                  value={assignment.progress_percent}
                                  tone={
                                    assignment.progress_percent >= 100
                                      ? "success"
                                      : "delegated"
                                  }
                                />
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              <form
                                action={updateFranchisePlaybookAssignmentStatus}
                                className="space-y-2 rounded-xl border border-brand-card-border bg-brand-muted p-3"
                              >
                                <input
                                  type="hidden"
                                  name="assignment_id"
                                  value={assignment.id}
                                />
                                <Select
                                  name="status"
                                  defaultValue={assignment.status}
                                  disabled={controlsDisabled}
                                >
                                  {ASSIGNMENT_STATUS_OPTIONS.map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </Select>
                                <Input
                                  name="note"
                                  placeholder="Check-in notitie"
                                  disabled={controlsDisabled}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                  disabled={controlsDisabled}
                                >
                                  Check-in opslaan
                                </Button>
                              </form>

                              <form
                                action={updateFranchisePlaybookStepProgress}
                                className="space-y-2 rounded-xl border border-brand-card-border bg-brand-muted p-3"
                              >
                                <input
                                  type="hidden"
                                  name="assignment_id"
                                  value={assignment.id}
                                />
                                <Select
                                  name="step_id"
                                  disabled={controlsDisabled || program.steps.length === 0}
                                  required
                                >
                                  <option value="">Kies stap...</option>
                                  {program.steps.map((step) => (
                                    <option key={step.id} value={step.id}>
                                      {step.position}. {step.title}
                                    </option>
                                  ))}
                                </Select>
                                <Select
                                  name="status"
                                  defaultValue="completed"
                                  disabled={controlsDisabled}
                                >
                                  {STEP_PROGRESS_OPTIONS.map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </Select>
                                <Input
                                  name="note"
                                  placeholder="Voortgangsnotitie of bewijs"
                                  disabled={controlsDisabled}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                  disabled={controlsDisabled || program.steps.length === 0}
                                >
                                  Stap bijwerken
                                </Button>
                              </form>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </FranchisePanel>
            ))
          )}
        </div>

        <div className="space-y-4">
          <FranchisePanel
            title="Nieuw programma"
            description="Maak een klantbeheerbaar playbook aan."
          >
            <form action={createFranchisePlaybookProgram} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Naam</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Bijv. Proefles conversieprogramma"
                  disabled={controlsDisabled}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="category">Categorie</Label>
                  <Select id="category" name="category" disabled={controlsDisabled}>
                    {CATEGORY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select id="status" name="status" disabled={controlsDisabled}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="objective">Doel</Label>
                <Textarea
                  id="objective"
                  name="objective"
                  rows={4}
                  placeholder="Welke verbetering moet dit programma in het netwerk realiseren?"
                  disabled={controlsDisabled}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  name="owner_label"
                  placeholder="Eigenaar"
                  defaultValue="Franchise manager"
                  disabled={controlsDisabled}
                />
                <Input
                  name="cadence"
                  placeholder="Cadans"
                  defaultValue="Maandelijks"
                  disabled={controlsDisabled}
                />
                <Input
                  name="target_audience"
                  placeholder="Doelgroep"
                  defaultValue="Franchisees"
                  disabled={controlsDisabled}
                />
                <Input
                  name="default_due_days"
                  type="number"
                  min="1"
                  max="365"
                  defaultValue="30"
                  disabled={controlsDisabled}
                />
              </div>
              <Button type="submit" className="w-full" disabled={controlsDisabled}>
                Programma aanmaken
              </Button>
            </form>
          </FranchisePanel>

          <FranchisePanel
            title="Programma governance"
            description="De vaste klantflow."
          >
            <div className="space-y-3">
              {[
                {
                  icon: ClipboardList,
                  title: "Programma",
                  text: "Definieer doel, eigenaar, cadans en doelgroep.",
                },
                {
                  icon: ListChecks,
                  title: "Stappen",
                  text: "Maak acties concreet en meetbaar per franchisee.",
                },
                {
                  icon: ClipboardCheck,
                  title: "Check-in",
                  text: "Stuur op status, blokkades, bewijs en voortgang.",
                },
                {
                  icon: ShieldCheck,
                  title: "Audit",
                  text: "Elke belangrijke wijziging schrijft een auditregel.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="font-black text-foreground">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </FranchisePanel>
        </div>
      </section>
    </FranchisePage>
  );
}
