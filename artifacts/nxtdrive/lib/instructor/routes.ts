import type { MemberRole } from "@/lib/types";

export type InstructorRouteId =
  | "home"
  | "agenda"
  | "lesson"
  | "students"
  | "student"
  | "messages"
  | "message"
  | "tasks"
  | "availability"
  | "theory"
  | "settings"
  | "help"
  | "releaseNotes"
  | "more"
  | "vehicles"
  | "reports"
  | "profile"
  | "notifications"
  | "offline"
  | "intake"
  | "newAppointment"
  | "appointment";

export type InstructorRouteDefinition = {
  id: InstructorRouteId;
  canonicalPath: string;
  aliases: readonly string[];
  navLabel: string;
  analyticsKey: `instructor.${string}`;
  allowedRoles: readonly MemberRole[];
  requiredEntitlements: readonly string[];
  featureFlag?: string;
  visibility: "navigation" | "contextual" | "hidden";
};

export type InstructorSearchParams = Record<
  string,
  string | readonly string[] | undefined
>;

const INSTRUCTOR_ROLES = ["instructor", "tenant_admin"] as const;

export const instructorRoutes = [
  {
    id: "home",
    canonicalPath: "/instructeur",
    aliases: ["/instructor"],
    navLabel: "Cockpit",
    analyticsKey: "instructor.home",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "agenda",
    canonicalPath: "/instructeur/agenda",
    aliases: [
      "/instructeur/lessons",
      "/instructeur/les-evaluaties",
      "/instructor/agenda",
      "/instructor/lessons",
      "/instructor/les-evaluaties",
      "/instructor/evaluations",
      "/instructor/week",
    ],
    navLabel: "Agenda",
    analyticsKey: "instructor.agenda",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "lesson",
    canonicalPath: "/instructeur/lessen/[lessonId]",
    aliases: [
      "/instructor/[lessonId]",
      "/instructor/lessons/[lessonId]",
      "/instructor/les-evaluaties/[lessonId]",
      "/instructor/evaluations/[lessonId]",
      "/instructor/evaluations/[lessonId]/start",
      "/instructor/evaluations/[lessonId]/complete",
      "/instructeur/les-evaluaties/[lessonId]",
    ],
    navLabel: "Lesson Cockpit",
    analyticsKey: "instructor.lesson",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "students",
    canonicalPath: "/instructeur/leerlingen",
    aliases: [
      "/instructeur/students",
      "/instructor/leerlingen",
      "/instructor/students",
    ],
    navLabel: "Leerlingen",
    analyticsKey: "instructor.students",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "student",
    canonicalPath: "/instructeur/leerlingen/[studentId]",
    aliases: [
      "/instructeur/students/[studentId]",
      "/instructor/leerlingen/[studentId]",
      "/instructor/students/[studentId]",
    ],
    navLabel: "Leerling",
    analyticsKey: "instructor.student",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "messages",
    canonicalPath: "/instructeur/berichten",
    aliases: [
      "/instructeur/messages",
      "/instructor/berichten",
      "/instructor/messages",
    ],
    navLabel: "Berichten",
    analyticsKey: "instructor.messages",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "message",
    canonicalPath: "/instructeur/berichten/[conversationId]",
    aliases: [
      "/instructeur/messages/[conversationId]",
      "/instructor/berichten/[conversationId]",
      "/instructor/messages/[conversationId]",
    ],
    navLabel: "Gesprek",
    analyticsKey: "instructor.message",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "tasks",
    canonicalPath: "/instructeur/taken",
    aliases: [
      "/instructeur/tasks",
      "/instructor/taken",
      "/instructor/tasks",
    ],
    navLabel: "Taken",
    analyticsKey: "instructor.tasks",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "availability",
    canonicalPath: "/instructeur/beschikbaarheid",
    aliases: [
      "/instructeur/availability",
      "/instructor/beschikbaarheid",
      "/instructor/availability",
    ],
    navLabel: "Beschikbaarheid",
    analyticsKey: "instructor.availability",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "theory",
    canonicalPath: "/instructeur/theorie",
    aliases: [
      "/instructeur/theory",
      "/instructor/theorie",
      "/instructor/theory",
    ],
    navLabel: "Theorie",
    analyticsKey: "instructor.theory",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "settings",
    canonicalPath: "/instructeur/instellingen",
    aliases: ["/instructor/instellingen", "/instructor/settings"],
    navLabel: "Instellingen",
    analyticsKey: "instructor.settings",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "help",
    canonicalPath: "/instructeur/help",
    aliases: ["/instructor/help"],
    navLabel: "Help",
    analyticsKey: "instructor.help",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "releaseNotes",
    canonicalPath: "/instructeur/release-notes",
    aliases: ["/instructor/release-notes"],
    navLabel: "Release notes",
    analyticsKey: "instructor.release_notes",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "more",
    canonicalPath: "/instructeur/meer",
    aliases: ["/instructor/meer", "/instructor/more"],
    navLabel: "Meer",
    analyticsKey: "instructor.more",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "hidden",
  },
  {
    id: "vehicles",
    canonicalPath: "/instructeur/voertuigen",
    aliases: ["/instructor/voertuigen", "/instructor/vehicles"],
    navLabel: "Voertuigen",
    analyticsKey: "instructor.vehicles",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "reports",
    canonicalPath: "/instructeur/rapportages",
    aliases: ["/instructor/rapportages", "/instructor/reports"],
    navLabel: "Rapportages",
    analyticsKey: "instructor.reports",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "profile",
    canonicalPath: "/instructeur/profiel",
    aliases: ["/instructor/profiel", "/instructor/profile"],
    navLabel: "Profiel",
    analyticsKey: "instructor.profile",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "notifications",
    canonicalPath: "/instructeur/meldingen",
    aliases: ["/instructor/meldingen"],
    navLabel: "Meldingen",
    analyticsKey: "instructor.notifications",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "offline",
    canonicalPath: "/instructeur/offline",
    aliases: ["/instructor/offline"],
    navLabel: "Offline",
    analyticsKey: "instructor.offline",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "hidden",
  },
  {
    id: "intake",
    canonicalPath: "/instructeur/intake",
    aliases: ["/instructor/intake"],
    navLabel: "Intake",
    analyticsKey: "instructor.intake",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "newAppointment",
    canonicalPath: "/instructeur/agenda/nieuw",
    aliases: [
      "/instructeur/agenda/new",
      "/instructor/agenda/new",
      "/instructor/afspraak/nieuw",
      "/instructor/les/nieuw",
    ],
    navLabel: "Nieuwe afspraak",
    analyticsKey: "instructor.new_appointment",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "appointment",
    canonicalPath: "/instructeur/agenda/[appointmentId]",
    aliases: [
      "/instructor/agenda/[appointmentId]",
      "/instructor/afspraak/[appointmentId]",
    ],
    navLabel: "Afspraak",
    analyticsKey: "instructor.appointment",
    allowedRoles: INSTRUCTOR_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
] as const satisfies readonly InstructorRouteDefinition[];

export const instructorNavigation = instructorRoutes.filter(
  (route) => route.visibility === "navigation",
);

export function canAccessInstructorRoute(
  route: InstructorRouteDefinition,
  context: {
    roles: readonly MemberRole[];
    entitlements?: readonly string[];
    featureFlags?: Readonly<Record<string, boolean>>;
  },
): boolean {
  if (!route.allowedRoles.some((role) => context.roles.includes(role))) {
    return false;
  }
  const entitlements = new Set(context.entitlements ?? []);
  if (
    route.requiredEntitlements.some(
      (entitlement) => !entitlements.has(entitlement),
    )
  ) {
    return false;
  }
  return route.featureFlag
    ? context.featureFlags?.[route.featureFlag] === true
    : true;
}

export function visibleInstructorNavigation(context: {
  roles: readonly MemberRole[];
  entitlements?: readonly string[];
  featureFlags?: Readonly<Record<string, boolean>>;
}): InstructorRouteDefinition[] {
  return instructorNavigation.filter((route) =>
    canAccessInstructorRoute(route, context),
  );
}

export const instructorRouteAliases = instructorRoutes.flatMap((route) =>
  route.aliases.map((source) => ({
    source,
    destination: route.canonicalPath,
    permanent: true as const,
  })),
);

function routeById(id: InstructorRouteId): InstructorRouteDefinition {
  const route = instructorRoutes.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`Unknown instructor route: ${id}`);
  return route;
}

function interpolatePath(
  pattern: string,
  params: Record<string, string | undefined>,
): string {
  return pattern.replace(/\[([^\]]+)\]/g, (_match, key: string) => {
    const value = params[key];
    if (!value) throw new Error(`Missing route parameter: ${key}`);
    return encodeURIComponent(value);
  });
}

function appendQuery(path: string, query: InstructorSearchParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined) {
      search.append(key, value as string);
    }
  }
  const serialized = search.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function buildInstructorRoute(
  id: InstructorRouteId,
  params: Record<string, string | undefined> = {},
  query: InstructorSearchParams = {},
): string {
  return appendQuery(interpolatePath(routeById(id).canonicalPath, params), query);
}

function matchRoutePattern(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const keys: string[] = [];
  const parts = pattern.split("/").map((part) => {
    const match = /^\[([^\]]+)\]$/.exec(part);
    if (match) {
      keys.push(match[1]!);
      return "([^/]+)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  const match = new RegExp(`^${parts.join("/")}/?$`).exec(pathname);
  if (!match) return null;
  return Object.fromEntries(
    keys.map((key, index) => [key, decodeURIComponent(match[index + 1] ?? "")]),
  );
}

export function canonicalizeInstructorPath(pathname: string): string | null {
  const candidates = instructorRoutes
    .flatMap((route) => [
      { pattern: route.canonicalPath, canonical: route.canonicalPath },
      ...route.aliases.map((pattern) => ({
        pattern,
        canonical: route.canonicalPath,
      })),
    ])
    .sort((left, right) => {
      const dynamicDifference =
        (left.pattern.includes("[") ? 1 : 0) -
        (right.pattern.includes("[") ? 1 : 0);
      return dynamicDifference || right.pattern.length - left.pattern.length;
    });

  for (const candidate of candidates) {
    const params = matchRoutePattern(candidate.pattern, pathname);
    if (params) return interpolatePath(candidate.canonical, params);
  }
  return null;
}

export function instructorAnalyticsKeyForPath(
  pathname: string,
): InstructorRouteDefinition["analyticsKey"] | null {
  const canonical = canonicalizeInstructorPath(pathname);
  if (!canonical) return null;
  for (const route of instructorRoutes) {
    if (matchRoutePattern(route.canonicalPath, canonical)) {
      return route.analyticsKey;
    }
  }
  return null;
}
