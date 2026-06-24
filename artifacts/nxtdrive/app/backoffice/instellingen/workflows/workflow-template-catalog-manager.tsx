"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Clock3,
  Filter,
  ListChecks,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TENANT_WORKFLOW_CATALOG,
  WORKFLOW_CATEGORIES,
  WORKFLOW_CHANNELS,
  WORKFLOW_MODES,
  WORKFLOW_OWNER_ROLES,
  WORKFLOW_TEMPLATE_CATALOG,
  type TenantWorkflowCatalogSettings,
  type WorkflowCategory,
  type WorkflowChannel,
  type WorkflowMode,
  type WorkflowOwnerRole,
  type WorkflowTemplateState,
} from "@/lib/tenant/workflow-catalog";
import {
  resetTenantWorkflowCatalog,
  saveTenantWorkflowCatalog,
} from "../actions";

const CATEGORY_LABELS: Record<WorkflowCategory, string> = {
  instroom: "Instroom",
  planning: "Planning",
  finance: "Finance",
  kwaliteit: "Kwaliteit",
  dossier: "Dossier",
  communicatie: "Communicatie",
};

const MODE_LABELS: Record<WorkflowMode, string> = {
  manual: "Handmatig",
  suggested: "Voorstel",
  automatic: "Automatisch",
};

const OWNER_LABELS: Record<WorkflowOwnerRole, string> = {
  tenant_admin: "Beheerder",
  planning: "Planning",
  instructor: "Instructeur",
  finance: "Finance",
  support: "Support",
};

const CHANNEL_LABELS: Record<WorkflowChannel, string> = {
  task: "Taak",
  email: "E-mail",
  push: "Push",
  in_app: "In-app",
  dashboard_signal: "Dashboard",
};

function cloneSettings(
  settings: TenantWorkflowCatalogSettings,
): TenantWorkflowCatalogSettings {
  return {
    version: 1,
    templates: Object.fromEntries(
      Object.entries(settings.templates).map(([id, state]) => [
        id,
        {
          ...state,
          channels: [...state.channels],
        },
      ]),
    ),
  };
}

function templateState(
  settings: TenantWorkflowCatalogSettings,
  templateId: string,
): WorkflowTemplateState {
  return (
    settings.templates[templateId] ??
    DEFAULT_TENANT_WORKFLOW_CATALOG.templates[templateId]
  );
}

function updateTemplateState(
  settings: TenantWorkflowCatalogSettings,
  templateId: string,
  patch: Partial<WorkflowTemplateState>,
): TenantWorkflowCatalogSettings {
  const next = cloneSettings(settings);
  next.templates[templateId] = {
    ...templateState(settings, templateId),
    ...patch,
  };
  return next;
}

function toggleChannel(
  state: WorkflowTemplateState,
  channel: WorkflowChannel,
  checked: boolean,
): WorkflowChannel[] {
  if (checked) return Array.from(new Set([...state.channels, channel]));
  const next = state.channels.filter((item) => item !== channel);
  return next.length > 0 ? next : state.channels;
}

export function WorkflowTemplateCatalogManager({
  initialSettings,
}: {
  initialSettings: TenantWorkflowCatalogSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState(() => cloneSettings(initialSettings));
  const [category, setCategory] = useState<WorkflowCategory | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const visibleTemplates = useMemo(
    () =>
      WORKFLOW_TEMPLATE_CATALOG.filter(
        (template) => category === "all" || template.category === category,
      ),
    [category],
  );

  const enabledCount = WORKFLOW_TEMPLATE_CATALOG.filter(
    (template) => templateState(settings, template.id).enabled,
  ).length;

  function setState(templateId: string, patch: Partial<WorkflowTemplateState>) {
    setSettings((current) => updateTemplateState(current, templateId, patch));
    setSaved(false);
  }

  function validate(): string | null {
    for (const template of WORKFLOW_TEMPLATE_CATALOG) {
      const state = templateState(settings, template.id);
      if (!state.enabled) continue;
      if (state.channels.length === 0) {
        return `${template.title}: kies minimaal een kanaal.`;
      }
      if (!Number.isFinite(state.slaHours) || state.slaHours < 1) {
        return `${template.title}: SLA moet minimaal 1 uur zijn.`;
      }
    }
    return null;
  }

  function onSave() {
    const message = validate();
    if (message) {
      setError(message);
      setSaved(false);
      return;
    }
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set("settings", JSON.stringify(settings));
    startTransition(async () => {
      const result = await saveTenantWorkflowCatalog(formData);
      if (!result.ok) {
        setError(result.error ?? "Workflowcatalogus kon niet worden opgeslagen.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function onReset() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await resetTenantWorkflowCatalog();
      if (!result.ok) {
        setError(result.error ?? "Workflowcatalogus kon niet worden teruggezet.");
        return;
      }
      setSettings(cloneSettings(DEFAULT_TENANT_WORKFLOW_CATALOG));
      setSaved(true);
      router.refresh();
    });
  }

  function applyRecommended() {
    setSettings((current) => {
      let next = cloneSettings(current);
      for (const template of WORKFLOW_TEMPLATE_CATALOG) {
        const state = templateState(next, template.id);
        next = updateTemplateState(next, template.id, {
          enabled: true,
          mode: template.recommendedMode,
          ownerRole: template.defaultOwnerRole,
          slaHours: template.defaultSlaHours,
          channels: [...template.defaultChannels],
          notes: state.notes,
        });
      }
      return next;
    });
    setSaved(false);
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          Workflowcatalogus opgeslagen.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-[var(--surface-1)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">
            {enabledCount}/{WORKFLOW_TEMPLATE_CATALOG.length} actief
          </Badge>
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Tenantbreed, auditbaar en veilig opgeslagen
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={applyRecommended}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Aanbevolen set
          </Button>
          <Button type="button" size="sm" disabled={pending} onClick={onSave}>
            <Save className="h-4 w-4" aria-hidden />
            Opslaan
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="h-4 w-4 text-primary" aria-hidden />
          Filter
        </span>
        <button
          type="button"
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            category === "all"
              ? "border-primary bg-primary-soft text-primary"
              : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setCategory("all")}
        >
          Alles
        </button>
        {WORKFLOW_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              category === item
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setCategory(item)}
          >
            {CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleTemplates.map((template) => {
          const state = templateState(settings, template.id);
          return (
            <article
              key={template.id}
              className={cn(
                "overflow-hidden rounded-2xl border bg-[var(--surface-1)] shadow-sm",
                state.enabled ? "border-primary/35" : "border-border",
              )}
            >
              <div className="border-b border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={state.enabled ? "success" : "outline"}>
                        {state.enabled ? "Actief" : "Uit"}
                      </Badge>
                      <Badge variant="primary">
                        {CATEGORY_LABELS[template.category]}
                      </Badge>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                      {template.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {template.description}
                    </p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(event) =>
                        setState(template.id, { enabled: event.target.checked })
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    Aan
                  </label>
                </div>
              </div>

              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-[var(--surface-2)] p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Bell className="h-4 w-4 text-primary" aria-hidden />
                      Trigger
                    </p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {template.trigger}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${template.id}_mode`}>Modus</Label>
                      <Select
                        id={`${template.id}_mode`}
                        value={state.mode}
                        disabled={!state.enabled}
                        onChange={(event) =>
                          setState(template.id, {
                            mode: event.target.value as WorkflowMode,
                          })
                        }
                      >
                        {WORKFLOW_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {MODE_LABELS[mode]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${template.id}_owner`}>Eigenaar</Label>
                      <Select
                        id={`${template.id}_owner`}
                        value={state.ownerRole}
                        disabled={!state.enabled}
                        onChange={(event) =>
                          setState(template.id, {
                            ownerRole: event.target.value as WorkflowOwnerRole,
                          })
                        }
                      >
                        {WORKFLOW_OWNER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {OWNER_LABELS[role]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${template.id}_sla`}>
                      SLA voor opvolging
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`${template.id}_sla`}
                        type="number"
                        min={1}
                        max={8760}
                        value={state.slaHours}
                        disabled={!state.enabled}
                        onChange={(event) =>
                          setState(template.id, {
                            slaHours: Number(event.target.value),
                          })
                        }
                        className="w-28 tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">uur</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Kanalen
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {WORKFLOW_CHANNELS.map((channel) => (
                        <label
                          key={channel}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                            state.channels.includes(channel)
                              ? "border-primary/30 bg-primary-soft text-primary"
                              : "border-border bg-[var(--surface-2)] text-muted-foreground",
                            !state.enabled && "opacity-60",
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={!state.enabled}
                            checked={state.channels.includes(channel)}
                            onChange={(event) =>
                              setState(template.id, {
                                channels: toggleChannel(
                                  state,
                                  channel,
                                  event.target.checked,
                                ),
                              })
                            }
                            className="h-3.5 w-3.5 rounded border-border"
                          />
                          {CHANNEL_LABELS[channel]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-border">
                    <div className="border-b border-border px-3 py-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <ListChecks className="h-4 w-4 text-primary" aria-hidden />
                        Workflowstappen
                      </p>
                    </div>
                    <div className="divide-y divide-border">
                      {template.steps.map((step, index) => (
                        <div key={step.id} className="flex gap-3 px-3 py-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">
                              {step.title}
                            </p>
                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              {step.description}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Eigenaar:{" "}
                              <span className="font-medium text-foreground">
                                {OWNER_LABELS[step.ownerRole]}
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${template.id}_notes`}>
                      Interne notitie
                    </Label>
                    <textarea
                      id={`${template.id}_notes`}
                      disabled={!state.enabled}
                      value={state.notes ?? ""}
                      maxLength={600}
                      onChange={(event) =>
                        setState(template.id, { notes: event.target.value })
                      }
                      placeholder="Bijvoorbeeld: alleen voor vestiging Utrecht of eerst handmatig laten beoordelen."
                      className="min-h-24 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                    />
                  </div>

                  <a
                    href={template.primaryHref}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    <Clock3 className="h-4 w-4" aria-hidden />
                    Open bijbehorende workflow
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-[var(--surface-1)] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          Bewaarlogica
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Templates zetten geen verborgen acties live. Ze leggen vast welke
          workflow de rijschool gebruikt, wie eigenaar is, welke kanalen meedoen
          en binnen welke termijn opgevolgd moet worden. Operationele flows
          blijven hun bestaande servervalidatie gebruiken.
        </p>
      </div>
    </div>
  );
}

