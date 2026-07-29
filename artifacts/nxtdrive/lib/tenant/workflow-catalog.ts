import type { SupabaseClient } from "@supabase/supabase-js";

export const TENANT_WORKFLOW_CATALOG_KEY = "tenant_workflow_catalog";

export const WORKFLOW_CATEGORIES = [
  "instroom",
  "planning",
  "finance",
  "kwaliteit",
  "dossier",
  "communicatie",
] as const;

export type WorkflowCategory = (typeof WORKFLOW_CATEGORIES)[number];

export const WORKFLOW_MODES = ["manual", "suggested", "automatic"] as const;
export type WorkflowMode = (typeof WORKFLOW_MODES)[number];

export const WORKFLOW_OWNER_ROLES = [
  "tenant_admin",
  "planning",
  "instructor",
  "finance",
  "support",
] as const;
export type WorkflowOwnerRole = (typeof WORKFLOW_OWNER_ROLES)[number];

export const WORKFLOW_CHANNELS = [
  "task",
  "email",
  "push",
  "in_app",
  "dashboard_signal",
] as const;
export type WorkflowChannel = (typeof WORKFLOW_CHANNELS)[number];

export type WorkflowTemplateStep = {
  id: string;
  title: string;
  description: string;
  ownerRole: WorkflowOwnerRole;
  targetHref: string;
};

export type WorkflowTemplateDefinition = {
  id: string;
  title: string;
  description: string;
  category: WorkflowCategory;
  trigger: string;
  recommendedMode: WorkflowMode;
  defaultOwnerRole: WorkflowOwnerRole;
  defaultSlaHours: number;
  defaultChannels: WorkflowChannel[];
  primaryHref: string;
  steps: WorkflowTemplateStep[];
};

export type WorkflowTemplateState = {
  enabled: boolean;
  mode: WorkflowMode;
  ownerRole: WorkflowOwnerRole;
  slaHours: number;
  channels: WorkflowChannel[];
  notes: string | null;
};

export type TenantWorkflowCatalogSettings = {
  version: 1;
  templates: Record<string, WorkflowTemplateState>;
};

function templateStep(
  id: string,
  title: string,
  description: string,
  ownerRole: WorkflowOwnerRole,
  targetHref: string,
): WorkflowTemplateStep {
  return { id, title, description, ownerRole, targetHref };
}

export const WORKFLOW_TEMPLATE_CATALOG: WorkflowTemplateDefinition[] = [
  {
    id: "lead_intake_triage",
    title: "Nieuwe lead opvolgen",
    description:
      "Zet nieuwe intakes direct om naar een beoordeelde lead met routeadvies, eigenaar en vervolgstap.",
    category: "instroom",
    trigger: "Nieuwe intake of marketingwidget-lead komt binnen",
    recommendedMode: "suggested",
    defaultOwnerRole: "planning",
    defaultSlaHours: 4,
    defaultChannels: ["task", "dashboard_signal", "email"],
    primaryHref: "/backoffice/leads",
    steps: [
      templateStep(
        "score",
        "Leadscore controleren",
        "Controleer score, herkomst, campagne en vestigingsadvies.",
        "planning",
        "/backoffice/leads",
      ),
      templateStep(
        "contact",
        "Contactmoment plannen",
        "Plan belmoment, proefles of intake-afspraak volgens beschikbaarheid.",
        "planning",
        "/backoffice/planning-board",
      ),
      templateStep(
        "handover",
        "Dossier klaarzetten",
        "Leg voorkeuren, NAW-status en opvolgnotities vast voor de instructeur.",
        "tenant_admin",
        "/backoffice/leads",
      ),
    ],
  },
  {
    id: "trial_lesson_follow_up",
    title: "Proefles opvolgen",
    description:
      "Na een proefles automatisch zorgen voor evaluatie, pakketadvies en conversie-opvolging.",
    category: "instroom",
    trigger: "Proefles is afgerond of gemarkeerd als no-show",
    recommendedMode: "suggested",
    defaultOwnerRole: "planning",
    defaultSlaHours: 24,
    defaultChannels: ["task", "email", "dashboard_signal"],
    primaryHref: "/backoffice/leads",
    steps: [
      templateStep(
        "evaluation",
        "Proeflesresultaat vastleggen",
        "Leg niveau, transmissieadvies en aandachtspunten vast.",
        "instructor",
        "/instructeur/agenda",
      ),
      templateStep(
        "package",
        "Pakket voorstellen",
        "Koppel passend pakket of intake-aanbod aan de lead.",
        "planning",
        "/backoffice/packages",
      ),
      templateStep(
        "convert",
        "Conversie afronden",
        "Maak leerlingdossier aan of plan een nieuwe opvolgactie.",
        "tenant_admin",
        "/backoffice/leads",
      ),
    ],
  },
  {
    id: "low_credit_recovery",
    title: "Tegoed bijna op",
    description:
      "Voorkom lesuitval door leerlingen of ouders tijdig richting opwaarderen of facturatie te sturen.",
    category: "finance",
    trigger: "Beschikbaar lestegoed zakt onder tenantdrempel",
    recommendedMode: "automatic",
    defaultOwnerRole: "finance",
    defaultSlaHours: 48,
    defaultChannels: ["email", "push", "in_app", "dashboard_signal"],
    primaryHref: "/backoffice/boekhouding",
    steps: [
      templateStep(
        "signal",
        "Saldo-signaal tonen",
        "Toon waarschuwing in leerling 360, leerlingapp en backoffice.",
        "finance",
        "/backoffice/leerlingen",
      ),
      templateStep(
        "payment",
        "Betaalroute aanbieden",
        "Stuur leerling of ouder naar de juiste betaalstatus-flow.",
        "finance",
        "/backoffice/facturen",
      ),
      templateStep(
        "hold",
        "Planning bewaken",
        "Blokkeer geen bestaande lessen, maar markeer risico op onvoldoende tegoed.",
        "planning",
        "/backoffice/planning-board",
      ),
    ],
  },
  {
    id: "lesson_reschedule_recovery",
    title: "Annulering herbezetten",
    description:
      "Maak van late annuleringen direct een herstelkans met kandidaten, uitnodigingen en auditbare opvolging.",
    category: "planning",
    trigger: "Les wordt geannuleerd binnen het herstelvenster",
    recommendedMode: "suggested",
    defaultOwnerRole: "planning",
    defaultSlaHours: 2,
    defaultChannels: ["task", "push", "dashboard_signal"],
    primaryHref: "/backoffice/agenda/herbezetten",
    steps: [
      templateStep(
        "candidates",
        "Kandidaten bepalen",
        "Gebruik route, rayon, tegoed, instructeur en voertuig om kandidaten te rangschikken.",
        "planning",
        "/backoffice/agenda/herbezetten",
      ),
      templateStep(
        "invite",
        "Uitnodigingen versturen",
        "Stuur herbezet-uitnodigingen volgens tenantregels.",
        "planning",
        "/backoffice/instellingen",
      ),
      templateStep(
        "confirm",
        "Nieuwe les bevestigen",
        "Maak het slot definitief zodra een leerling accepteert.",
        "planning",
        "/backoffice/planning-board",
      ),
    ],
  },
  {
    id: "ris_lesson_closeout",
    title: "RIS-les afronden",
    description:
      "Zorg dat leskaart, reflectie, scorewijzigingen en samenvatting altijd netjes afgerond worden.",
    category: "kwaliteit",
    trigger: "Rijles is afgelopen en leskaart staat nog open",
    recommendedMode: "suggested",
    defaultOwnerRole: "instructor",
    defaultSlaHours: 12,
    defaultChannels: ["task", "in_app", "dashboard_signal"],
    primaryHref: "/instructeur/agenda",
    steps: [
      templateStep(
        "score",
        "Scripts beoordelen",
        "Werk N en 1 t/m 8 scores en labels per RIS-script bij.",
        "instructor",
        "/instructeur/agenda",
      ),
      templateStep(
        "reflection",
        "Reflectie verwerken",
        "Neem leerlingreflectie en leerwens mee in de samenvatting.",
        "instructor",
        "/instructeur/agenda",
      ),
      templateStep(
        "publish",
        "Publiceren bevestigen",
        "Publiceer definitief zodat de leerling voortgang ziet.",
        "instructor",
        "/instructeur/agenda",
      ),
    ],
  },
  {
    id: "exam_readiness_review",
    title: "Examengereedheid bewaken",
    description:
      "Bundel RIS, theorie, CBR-status en instructeursadvies voordat examenplanning wordt vrijgegeven.",
    category: "kwaliteit",
    trigger: "Leerling nadert examencriteria of praktijkexamen is aangevraagd",
    recommendedMode: "manual",
    defaultOwnerRole: "tenant_admin",
    defaultSlaHours: 72,
    defaultChannels: ["task", "dashboard_signal"],
    primaryHref: "/backoffice/cbr",
    steps: [
      templateStep(
        "ris",
        "RIS-voortgang controleren",
        "Controleer moduleontwikkeling, herhaalpunten en toetsklaar-labels.",
        "instructor",
        "/backoffice/ris",
      ),
      templateStep(
        "cbr",
        "CBR-status checken",
        "Controleer machtiging, theorie, gezondheidsverklaring en examenstatus.",
        "tenant_admin",
        "/backoffice/cbr",
      ),
      templateStep(
        "decision",
        "Planningbesluit nemen",
        "Plan examen, TTT of extra voorbereiding.",
        "planning",
        "/backoffice/planning-board",
      ),
    ],
  },
  {
    id: "document_quality_guard",
    title: "Dossierkwaliteit bewaken",
    description:
      "Maak ontbrekende NAW-gegevens, verlopen documenten en CBR-acties zichtbaar als gestructureerde taken.",
    category: "dossier",
    trigger: "Dossier mist verplichte gegevens of document verloopt",
    recommendedMode: "suggested",
    defaultOwnerRole: "tenant_admin",
    defaultSlaHours: 48,
    defaultChannels: ["task", "dashboard_signal"],
    primaryHref: "/backoffice/leerlingen",
    steps: [
      templateStep(
        "detect",
        "Ontbrekende gegevens signaleren",
        "Controleer NAW, contact, ouder/verzorger, CBR en documenten.",
        "tenant_admin",
        "/backoffice/leerlingen",
      ),
      templateStep(
        "request",
        "Gegevens opvragen",
        "Vraag leerling of ouder om aanvulling via de juiste communicatieflow.",
        "support",
        "/backoffice/berichten",
      ),
      templateStep(
        "close",
        "Dossier vrijgeven",
        "Markeer dossierkwaliteit als akkoord zodra alles compleet is.",
        "tenant_admin",
        "/backoffice/leerlingen",
      ),
    ],
  },
  {
    id: "instructor_availability_gap",
    title: "Beschikbaarheidstekort oplossen",
    description:
      "Stuurt bij wanneer capaciteit, herhaalpatronen of instructeursbeschikbaarheid niet aansluiten op vraag.",
    category: "planning",
    trigger: "Smart booking of planboard ziet structurele capaciteitstekorten",
    recommendedMode: "manual",
    defaultOwnerRole: "planning",
    defaultSlaHours: 24,
    defaultChannels: ["task", "dashboard_signal"],
    primaryHref: "/backoffice/beschikbaarheid",
    steps: [
      templateStep(
        "gap",
        "Tekort analyseren",
        "Bekijk bottlenecks per vestiging, instructeur, voertuig en type afspraak.",
        "planning",
        "/backoffice/planning-board",
      ),
      templateStep(
        "availability",
        "Beschikbaarheid aanpassen",
        "Vraag extra dagdelen of herhaalpatronen aan bij instructeurs.",
        "planning",
        "/backoffice/beschikbaarheid",
      ),
      templateStep(
        "recover",
        "Wachtrij herplannen",
        "Werk queue-items bij zodra capaciteit beschikbaar is.",
        "planning",
        "/backoffice/planning-queue",
      ),
    ],
  },
] as const;

const TEMPLATE_IDS = new Set(WORKFLOW_TEMPLATE_CATALOG.map((template) => template.id));

export function defaultWorkflowTemplateState(
  template: WorkflowTemplateDefinition,
): WorkflowTemplateState {
  return {
    enabled: false,
    mode: template.recommendedMode,
    ownerRole: template.defaultOwnerRole,
    slaHours: template.defaultSlaHours,
    channels: [...template.defaultChannels],
    notes: null,
  };
}

export const DEFAULT_TENANT_WORKFLOW_CATALOG: TenantWorkflowCatalogSettings = {
  version: 1,
  templates: Object.fromEntries(
    WORKFLOW_TEMPLATE_CATALOG.map((template) => [
      template.id,
      defaultWorkflowTemplateState(template),
    ]),
  ),
};

function boolValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function workflowMode(value: unknown, fallback: WorkflowMode): WorkflowMode {
  return typeof value === "string" && (WORKFLOW_MODES as readonly string[]).includes(value)
    ? (value as WorkflowMode)
    : fallback;
}

function ownerRole(value: unknown, fallback: WorkflowOwnerRole): WorkflowOwnerRole {
  return typeof value === "string" &&
    (WORKFLOW_OWNER_ROLES as readonly string[]).includes(value)
    ? (value as WorkflowOwnerRole)
    : fallback;
}

function channels(value: unknown, fallback: WorkflowChannel[]): WorkflowChannel[] {
  if (!Array.isArray(value)) return [...fallback];
  const selected = value.filter(
    (item): item is WorkflowChannel =>
      typeof item === "string" &&
      (WORKFLOW_CHANNELS as readonly string[]).includes(item),
  );
  return selected.length > 0 ? Array.from(new Set(selected)) : [...fallback];
}

export function mergeTenantWorkflowCatalogSettings(
  input: unknown,
): TenantWorkflowCatalogSettings {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const sourceTemplates =
    source.templates && typeof source.templates === "object" && !Array.isArray(source.templates)
      ? (source.templates as Record<string, unknown>)
      : {};

  const templates: Record<string, WorkflowTemplateState> = {};
  for (const template of WORKFLOW_TEMPLATE_CATALOG) {
    const defaults = defaultWorkflowTemplateState(template);
    const raw =
      sourceTemplates[template.id] &&
      typeof sourceTemplates[template.id] === "object" &&
      !Array.isArray(sourceTemplates[template.id])
        ? (sourceTemplates[template.id] as Record<string, unknown>)
        : {};
    templates[template.id] = {
      enabled: boolValue(raw.enabled, defaults.enabled),
      mode: workflowMode(raw.mode, defaults.mode),
      ownerRole: ownerRole(raw.ownerRole, defaults.ownerRole),
      slaHours: numberInRange(raw.slaHours, defaults.slaHours, 1, 8760),
      channels: channels(raw.channels, defaults.channels),
      notes: cleanString(raw.notes, 600),
    };
  }

  for (const id of Object.keys(sourceTemplates)) {
    if (!TEMPLATE_IDS.has(id)) continue;
    if (templates[id]) continue;
  }

  return { version: 1, templates };
}

export async function loadTenantWorkflowCatalogSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<TenantWorkflowCatalogSettings> {
  const { data, error } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", TENANT_WORKFLOW_CATALOG_KEY)
    .maybeSingle();
  if (error) throw new Error(`Workflowcatalogus laden mislukt: ${error.message}`);
  return mergeTenantWorkflowCatalogSettings(data?.value);
}

export function workflowCatalogSummary(settings: TenantWorkflowCatalogSettings) {
  const states = WORKFLOW_TEMPLATE_CATALOG.map(
    (template) => settings.templates[template.id] ?? defaultWorkflowTemplateState(template),
  );
  const enabled = states.filter((state) => state.enabled);
  return {
    total: WORKFLOW_TEMPLATE_CATALOG.length,
    enabled: enabled.length,
    automatic: enabled.filter((state) => state.mode === "automatic").length,
    suggested: enabled.filter((state) => state.mode === "suggested").length,
    manual: enabled.filter((state) => state.mode === "manual").length,
    categories: WORKFLOW_CATEGORIES.map((category) => ({
      category,
      total: WORKFLOW_TEMPLATE_CATALOG.filter((template) => template.category === category).length,
      enabled: WORKFLOW_TEMPLATE_CATALOG.filter(
        (template) => template.category === category && settings.templates[template.id]?.enabled,
      ).length,
    })),
  };
}
