import type { MemberRole } from "@/lib/types";
import { instructorRoutes } from "@/lib/instructor/routes";

export type RouteDefinition = {
  id: string;
  canonicalPath: string;
  aliases: readonly string[];
  navLabel: string;
  analyticsKey: string;
  allowedRoles: readonly MemberRole[];
  requiredEntitlements: readonly string[];
  featureFlag?: string;
  visibility: "navigation" | "contextual" | "hidden";
};

const LEARNER_ROLES = ["student", "parent"] as const;

export const learnerRoutes = [
  {
    id: "learner.home",
    canonicalPath: "/leerling",
    aliases: ["/student"],
    navLabel: "Home",
    analyticsKey: "learner.home",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "learner.progress",
    canonicalPath: "/leerling/voortgang",
    aliases: ["/student/voortgang"],
    navLabel: "Voortgang",
    analyticsKey: "learner.progress",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "learner.lessons",
    canonicalPath: "/leerling/lessen",
    aliases: ["/student/lessons", "/student/agenda"],
    navLabel: "Lessen",
    analyticsKey: "learner.lessons",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "learner.lesson",
    canonicalPath: "/leerling/lessen/[lessonId]",
    aliases: ["/student/lessons/[lessonId]", "/student/agenda/[lessonId]"],
    navLabel: "Les",
    analyticsKey: "learner.lesson",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.reflection",
    canonicalPath: "/leerling/reflectie",
    aliases: ["/student/journey", "/student/journey/ris"],
    navLabel: "Reflectie",
    analyticsKey: "learner.reflection",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "learner.messages",
    canonicalPath: "/leerling/berichten",
    aliases: ["/student/messages", "/student/berichten"],
    navLabel: "Berichten",
    analyticsKey: "learner.messages",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "learner.message",
    canonicalPath: "/leerling/berichten/[conversationId]",
    aliases: ["/student/messages/[conversationId]"],
    navLabel: "Gesprek",
    analyticsKey: "learner.message",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.exams",
    canonicalPath: "/leerling/examens",
    aliases: ["/student/cbr", "/student/cbr-exams"],
    navLabel: "Examens",
    analyticsKey: "learner.exams",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "learner.settings",
    canonicalPath: "/leerling/instellingen",
    aliases: ["/student/settings", "/student/profile"],
    navLabel: "Instellingen",
    analyticsKey: "learner.settings",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "navigation",
  },
  {
    id: "learner.theory",
    canonicalPath: "/leerling/theorie",
    aliases: ["/student/theory", "/student/theorie"],
    navLabel: "Theorie",
    analyticsKey: "learner.theory",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.payments",
    canonicalPath: "/leerling/betalingen",
    aliases: [
      "/student/payments",
      "/student/betalingen",
      "/student/facturen",
      "/student/credits",
    ],
    navLabel: "Betalingen",
    analyticsKey: "learner.payments",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.invoice",
    canonicalPath: "/leerling/betalingen/facturen/[invoiceId]",
    aliases: ["/student/facturen/[invoiceId]"],
    navLabel: "Factuur",
    analyticsKey: "learner.invoice",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.documents",
    canonicalPath: "/leerling/documenten",
    aliases: ["/student/documents"],
    navLabel: "Documenten",
    analyticsKey: "learner.documents",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.notifications",
    canonicalPath: "/leerling/meldingen",
    aliases: ["/student/notifications"],
    navLabel: "Meldingen",
    analyticsKey: "learner.notifications",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.offline",
    canonicalPath: "/leerling/offline",
    aliases: ["/student/offline"],
    navLabel: "Offline",
    analyticsKey: "learner.offline",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "hidden",
  },
  {
    id: "learner.select",
    canonicalPath: "/leerling/kies-leerling",
    aliases: ["/student/select-child"],
    navLabel: "Leerling kiezen",
    analyticsKey: "learner.select",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.bookLesson",
    canonicalPath: "/leerling/lessen/boeken",
    aliases: ["/student/lessons/book"],
    navLabel: "Les boeken",
    analyticsKey: "learner.book_lesson",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "contextual",
  },
  {
    id: "learner.more",
    canonicalPath: "/leerling/meer",
    aliases: ["/student/more"],
    navLabel: "Meer",
    analyticsKey: "learner.more",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "hidden",
  },
  {
    id: "learner.manifest",
    canonicalPath: "/leerling/manifest.webmanifest",
    aliases: ["/student/manifest.webmanifest"],
    navLabel: "Manifest",
    analyticsKey: "learner.manifest",
    allowedRoles: LEARNER_ROLES,
    requiredEntitlements: [],
    visibility: "hidden",
  },
] as const satisfies readonly RouteDefinition[];

export const routeManifest: readonly RouteDefinition[] = [
  ...instructorRoutes,
  ...learnerRoutes,
];

export const learnerNavigation = learnerRoutes.filter(
  (route) => route.visibility === "navigation",
);

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

function interpolatePath(
  pattern: string,
  params: Record<string, string>,
): string {
  return pattern.replace(/\[([^\]]+)\]/g, (_match, key: string) =>
    encodeURIComponent(params[key] ?? ""),
  );
}

export function canonicalizeAppPath(pathname: string): string | null {
  const candidates = routeManifest
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

export function analyticsKeyForPath(pathname: string): string | null {
  const canonical = canonicalizeAppPath(pathname);
  if (!canonical) return null;
  return (
    routeManifest.find((route) =>
      matchRoutePattern(route.canonicalPath, canonical),
    )?.analyticsKey ?? null
  );
}
