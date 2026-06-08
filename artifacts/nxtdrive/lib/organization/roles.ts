import type { MemberRole } from "@/lib/types";

export const STAFF_GOVERNANCE_ROLES = [
  "tenant_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

export type StaffGovernanceRole = (typeof STAFF_GOVERNANCE_ROLES)[number];
export type RoleScopePolicy = "organization" | "branch";

export type RoleGovernanceDefinition = {
  role: StaffGovernanceRole;
  label: string;
  short_label: string;
  description: string;
  intended_use: string;
  scope_policy: RoleScopePolicy;
  governance_note: string;
};

const ROLE_DEFINITIONS: Record<StaffGovernanceRole, RoleGovernanceDefinition> = {
  tenant_admin: {
    role: "tenant_admin",
    label: "Organisatiebeheerder",
    short_label: "Beheerder",
    description:
      "Volledige beheerrol voor organisatiestructuur, medewerkers, vestigingen, teams en instellingen.",
    intended_use:
      "Gebruik voor eigenaars of kernbeheerders die organisatiebreed mogen sturen.",
    scope_policy: "organization",
    governance_note:
      "Deze rol is canoniek organisatiebreed en wordt normaal niet beperkt tot losse vestigingen.",
  },
  branch_manager: {
    role: "branch_manager",
    label: "Vestigingsmanager",
    short_label: "Vestigingsmanager",
    description:
      "Lokaal leidinggevende rol voor een of meerdere vestigingen, met operationele sturing over planning en leerlingen.",
    intended_use:
      "Gebruik wanneer iemand vestigingsresultaat en dagelijkse operatie bewaakt, maar niet de hele organisatie beheert.",
    scope_policy: "branch",
    governance_note:
      "Deze rol hoort bijna altijd branch-scoped te zijn. Laat hem alleen organisatiebreed als dat echt een bewuste keuze is.",
  },
  planner: {
    role: "planner",
    label: "Planner",
    short_label: "Planner",
    description:
      "Operationele rol voor agenda, capaciteit en lesplanning zonder brede organisatie-instellingen.",
    intended_use:
      "Gebruik voor medewerkers die lessen, instructeurs en capaciteit dagelijks coördineren.",
    scope_policy: "branch",
    governance_note:
      "Branch-scope voorkomt dat planners per ongeluk over vestigingen heen gaan werken.",
  },
  admin_staff: {
    role: "admin_staff",
    label: "Administratie",
    short_label: "Administratie",
    description:
      "Backoffice-rol voor facturen, opvolging en administratieve verwerking binnen de operatie.",
    intended_use:
      "Gebruik voor office-medewerkers die financiële en operationele follow-up doen.",
    scope_policy: "branch",
    governance_note:
      "Deze rol is vaak branch-scoped, behalve bij een centrale administratie die bewust voor alle vestigingen werkt.",
  },
  marketing: {
    role: "marketing",
    label: "Marketing",
    short_label: "Marketing",
    description:
      "Groeirol voor leads, opvolging en campagne-activiteiten zonder toegang tot gevoelige beheerinstellingen.",
    intended_use:
      "Gebruik voor leadopvolging, campagnes en commerciële ondersteuning.",
    scope_policy: "branch",
    governance_note:
      "Branch-scope past goed bij lokale leadopvolging; organisatiebreed is alleen logisch bij centrale marketing.",
  },
  instructor: {
    role: "instructor",
    label: "Instructeur",
    short_label: "Instructeur",
    description:
      "Uitvoerende rol voor lessen en leerlingcontact, met beperkte leesrechten buiten de eigen context.",
    intended_use:
      "Gebruik voor docenten en instructeurs die vooral vanuit hun eigen planning en leerlingen werken.",
    scope_policy: "branch",
    governance_note:
      "Houd deze rol branch-scoped waar mogelijk, zodat instructeurs niet breder kijken dan nodig is.",
  },
};

export function governanceRoles(): readonly StaffGovernanceRole[] {
  return STAFF_GOVERNANCE_ROLES;
}

export function roleGovernanceDefinition(
  role: StaffGovernanceRole,
): RoleGovernanceDefinition {
  return ROLE_DEFINITIONS[role];
}

export function roleLabel(role: MemberRole): string {
  return role in ROLE_DEFINITIONS
    ? ROLE_DEFINITIONS[role as StaffGovernanceRole].short_label
    : role;
}

export function roleScopeLabel(role: StaffGovernanceRole): string {
  return ROLE_DEFINITIONS[role].scope_policy === "organization"
    ? "Organisatiebreed"
    : "Vestiging-scoped";
}

export function isBranchScopedGovernanceRole(role: MemberRole): boolean {
  return role in ROLE_DEFINITIONS
    ? ROLE_DEFINITIONS[role as StaffGovernanceRole].scope_policy === "branch"
    : false;
}
