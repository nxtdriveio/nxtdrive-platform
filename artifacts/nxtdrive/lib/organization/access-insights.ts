import type { MemberRole, OrgType } from "@/lib/types";
import type { Permission } from "@/lib/permissions";
import {
  permissionAction,
  permissionResource,
  roleGrantsPermission,
} from "@/lib/permissions";
import { roleGovernanceDefinition, type StaffGovernanceRole } from "./roles";

export const PERMISSION_RESOURCE_LABELS: Record<string, string> = {
  organization: "Organisatie",
  settings: "Instellingen",
  branch: "Vestigingen",
  team: "Teams",
  user: "Medewerkers",
  student: "Leerlingen",
  planning: "Planning",
  invoice: "Facturen",
  lead: "Leads",
  report: "Rapportages",
  franchise: "Franchise",
  vehicle: "Voertuigen",
  task: "Taken",
};

export const PERMISSION_ACTION_LABELS: Record<string, string> = {
  read: "Lezen",
  create: "Aanmaken",
  update: "Bijwerken",
  delete: "Verwijderen",
  manage: "Beheren",
  assign: "Toewijzen",
  export: "Exporteren",
};

export const ROLE_AUDIT_EXPLANATIONS: Partial<Record<MemberRole, string>> = {
  tenant_admin:
    "Gebruik deze rol alleen voor personen die namens de rijschool beslissingen mogen nemen over organisatie, instellingen, medewerkers en gevoelige configuratie.",
  franchise_admin:
    "Gebruik deze rol voor centrale franchise- of netwerkbeheerders. Leg delegaties altijd vast met scope, reden en geldigheid.",
  branch_manager:
    "Gebruik deze rol voor lokale sturing. Controleer in audits altijd of branch-scope actief is, tenzij centrale inzet bewust is vastgelegd.",
  planner:
    "Gebruik deze rol voor operationele planning. Deze rol hoort geen brede beheerinstellingen nodig te hebben.",
  admin_staff:
    "Gebruik deze rol voor administratie en facturatie. Beperk scope tot vestigingen waar de medewerker administratief voor werkt.",
  marketing:
    "Gebruik deze rol voor leads en campagnes. Vermijd toegang tot organisatie-instellingen en facturatiebeheer.",
  instructor:
    "Gebruik deze rol voor lesuitvoering en leerlingcontact. De medewerker ziet primair eigen planning en leerlingen binnen scope.",
  student:
    "Leerlingen zien alleen hun eigen lessen, tegoed, voortgang, betalingen, documenten en berichten.",
  parent:
    "Ouders zien alleen de onderdelen die expliciet voor oudertoegang zijn vrijgegeven voor gekoppelde leerlingen.",
};

export type RoleTemplate = {
  orgType: OrgType;
  label: string;
  bestFor: string;
  recommendedRoles: Array<{ role: MemberRole; countLabel: string; note: string }>;
};

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    orgType: "zzp",
    label: "ZZP-instructeur",
    bestFor: "Een zelfstandige instructeur met weinig aparte backoffice-rollen.",
    recommendedRoles: [
      {
        role: "tenant_admin",
        countLabel: "1",
        note: "Eigenaar/beheerder; combineert vaak beheer en instructie.",
      },
      {
        role: "instructor",
        countLabel: "1",
        note: "Lesuitvoering en leerlingcontact.",
      },
    ],
  },
  {
    orgType: "rijschool",
    label: "Lokale rijschool",
    bestFor: "Een rijschool met een klein team en centrale administratie.",
    recommendedRoles: [
      {
        role: "tenant_admin",
        countLabel: "1-2",
        note: "Eigenaar en eventueel vaste bedrijfsleider.",
      },
      {
        role: "planner",
        countLabel: "0-2",
        note: "Planning en herbezetten zonder brede settings.",
      },
      {
        role: "admin_staff",
        countLabel: "0-2",
        note: "Facturen, opvolging en administratieve taken.",
      },
      {
        role: "instructor",
        countLabel: "Team",
        note: "Instructeurs met branch- of eigen scope.",
      },
    ],
  },
  {
    orgType: "groot",
    label: "Groeiende rijschool",
    bestFor: "Groter team met aparte planning, administratie en marketing.",
    recommendedRoles: [
      {
        role: "tenant_admin",
        countLabel: "2",
        note: "Minimaal twee beheerders voor continuiteit.",
      },
      {
        role: "branch_manager",
        countLabel: "Per vestiging",
        note: "Lokale operationele verantwoordelijkheid.",
      },
      {
        role: "planner",
        countLabel: "Planningsteam",
        note: "Dagelijkse capaciteit en agenda.",
      },
      {
        role: "marketing",
        countLabel: "Optioneel",
        note: "Leads, campagnes en conversie.",
      },
    ],
  },
  {
    orgType: "multi_vestiging",
    label: "Multi-vestiging",
    bestFor: "Meerdere vestigingen met lokale managers en centrale regie.",
    recommendedRoles: [
      {
        role: "tenant_admin",
        countLabel: "Centrale directie",
        note: "Organisatiebreed, niet branch-scoped.",
      },
      {
        role: "branch_manager",
        countLabel: "Per vestiging",
        note: "Branch-scoped voor lokale operatie.",
      },
      {
        role: "planner",
        countLabel: "Centraal of lokaal",
        note: "Branch-scope expliciet vastleggen.",
      },
      {
        role: "admin_staff",
        countLabel: "Centrale backoffice",
        note: "Factuur- en opvolgrollen afbakenen.",
      },
    ],
  },
  {
    orgType: "franchise",
    label: "Franchiseorganisatie",
    bestFor: "Netwerksturing met franchisees en gedelegeerde acties.",
    recommendedRoles: [
      {
        role: "franchise_admin",
        countLabel: "Netwerkbeheer",
        note: "Alleen voor centrale franchise-regie.",
      },
      {
        role: "tenant_admin",
        countLabel: "Per franchisee",
        note: "Lokale eigenaar blijft verantwoordelijk.",
      },
      {
        role: "branch_manager",
        countLabel: "Lokaal",
        note: "Vestigingssturing binnen scope.",
      },
      {
        role: "planner",
        countLabel: "Gedelegeerd",
        note: "Alleen met expliciete delegatie bij centrale planning.",
      },
    ],
  },
];

export type AccessSurface = {
  key: string;
  title: string;
  description: string;
  permissions: Permission[];
  audience: Array<"staff" | "student" | "parent">;
};

export const ACCESS_SURFACES: AccessSurface[] = [
  {
    key: "backoffice-dashboard",
    title: "Backoffice dashboard",
    description: "Operationeel overzicht, alerts en snelle acties.",
    permissions: ["organization:read", "planning:read", "report:read"],
    audience: ["staff"],
  },
  {
    key: "planning",
    title: "Agenda en planboard",
    description: "Lessen, capaciteit, herbezetten en planningstaken.",
    permissions: ["planning:read", "planning:manage"],
    audience: ["staff", "student", "parent"],
  },
  {
    key: "students",
    title: "Leerlingdossiers",
    description: "NAW, voortgang, RIS, CBR, documenten en open taken.",
    permissions: ["student:read", "student:manage"],
    audience: ["staff", "student", "parent"],
  },
  {
    key: "leads",
    title: "Leads en campagnes",
    description: "Intake, leadopvolging, bronnen en conversie.",
    permissions: ["lead:read", "lead:manage"],
    audience: ["staff"],
  },
  {
    key: "billing",
    title: "Facturen en tegoed",
    description: "Open facturen, betalingen, tegoed en administratie.",
    permissions: ["invoice:read", "invoice:manage"],
    audience: ["staff", "student", "parent"],
  },
  {
    key: "vehicles",
    title: "Voertuigen",
    description: "Voertuigplanning, status, APK en beschikbaarheid.",
    permissions: ["vehicle:read", "vehicle:manage"],
    audience: ["staff"],
  },
  {
    key: "reports",
    title: "Rapportages",
    description: "Managementrapportages, exports en benchmarkinformatie.",
    permissions: ["report:read", "report:export"],
    audience: ["staff"],
  },
  {
    key: "settings",
    title: "Instellingen en rechten",
    description: "Organisatie, rollen, white-label, domeinen en configuratie.",
    permissions: ["settings:manage", "organization:update", "user:manage"],
    audience: ["staff"],
  },
  {
    key: "tasks",
    title: "Taken en workflows",
    description: "Open taken, opvolging en toegewezen acties.",
    permissions: ["task:read", "task:manage"],
    audience: ["staff", "student"],
  },
  {
    key: "franchise",
    title: "Franchise command center",
    description: "Netwerksturing, delegaties, templates en benchmarks.",
    permissions: ["franchise:manage"],
    audience: ["staff"],
  },
];

export type DelegationWizardSuggestion = {
  signal: string;
  suggestedPermission: string;
  scope: string;
  owner: string;
  auditReason: string;
  href: string;
};

export const DELEGATION_WIZARD_SUGGESTIONS: DelegationWizardSuggestion[] = [
  {
    signal: "Planningdruk of capaciteitsconflict",
    suggestedPermission: "Planning beheren",
    scope: "Vestiging of rayon",
    owner: "Planner of franchise-admin",
    auditReason: "Tijdelijke centrale planning om capaciteit te herstellen.",
    href: "/backoffice/franchise/delegaties",
  },
  {
    signal: "Lead blijft te lang onbeantwoord",
    suggestedPermission: "Lead routing",
    scope: "Bron, rayon of vestiging",
    owner: "Marketing of franchise-admin",
    auditReason: "Centrale intake mag lead doorzetten naar beschikbare eigenaar.",
    href: "/backoffice/franchise/delegaties",
  },
  {
    signal: "Template of playbook moet netwerkbreed live",
    suggestedPermission: "Templates toepassen",
    scope: "Gedelegeerde franchisees",
    owner: "Franchisebeheerder",
    auditReason: "Uniforme werkwijze of compliance-update.",
    href: "/backoffice/franchise/templates",
  },
  {
    signal: "Voertuig of instructeur valt uit",
    suggestedPermission: "Voertuigen/beschikbaarheid beheren",
    scope: "Vestiging, capability of voertuiggroep",
    owner: "Vestigingsmanager",
    auditReason: "Operationele continuiteit na verstoring.",
    href: "/backoffice/franchise/delegaties",
  },
];

export function roleAuditExplanation(role: MemberRole): string {
  if (ROLE_AUDIT_EXPLANATIONS[role]) return ROLE_AUDIT_EXPLANATIONS[role]!;
  return "Gebruik deze rol alleen wanneer de toegang logisch en uitlegbaar is binnen de dagelijkse operatie.";
}

export function permissionLabel(permission: Permission): string {
  const resource = permissionResource(permission);
  const action = permissionAction(permission);
  return `${PERMISSION_RESOURCE_LABELS[resource] ?? resource} ${PERMISSION_ACTION_LABELS[action] ?? action}`;
}

export function roleDisplayLabel(role: MemberRole): string {
  const staffRoles = [
    "tenant_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
    "instructor",
  ] as const satisfies readonly StaffGovernanceRole[];

  if ((staffRoles as readonly string[]).includes(role)) {
    return roleGovernanceDefinition(role as StaffGovernanceRole).label;
  }
  if (role === "franchise_admin") return "Franchisebeheerder";
  if (role === "student") return "Leerling";
  if (role === "parent") return "Ouder";
  return role;
}

export function surfaceVisibleWithPermissions(
  surface: AccessSurface,
  permissions: readonly Permission[],
): boolean {
  return surface.permissions.some((permission) =>
    permissions.some((granted) => granted === permission),
  );
}

export function defaultPermissionsForRole(role: MemberRole): Permission[] {
  return ACCESS_SURFACES.flatMap((surface) => surface.permissions).filter(
    (permission, index, all) =>
      all.indexOf(permission) === index && roleGrantsPermission(role, permission),
  );
}
