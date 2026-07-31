export type StudentNextAction = {
  kind:
    | "response"
    | "payment"
    | "lesson"
    | "cbr"
    | "planning"
    | "theory"
    | "practice";
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
};

export type StudentNextActionInput = {
  nowIso: string;
  examInvitationCount: number;
  lessonProposalCount: number;
  overdueInvoiceCount: number;
  creditAvailableMinutes: number;
  nextLesson: {
    href: string;
    startsAt: string;
  } | null;
  cbr: {
    theoryDone: boolean;
    authorizationReceived: boolean;
    healthDeclarationRequired: boolean;
    healthDeclarationDone: boolean;
  };
  fallback: {
    title: string;
    body: string;
    href: string;
  };
};

const UPCOMING_LESSON_WINDOW_MS = 24 * 60 * 60 * 1000;

export function deriveStudentNextAction(
  input: StudentNextActionInput,
): StudentNextAction {
  if (input.examInvitationCount > 0) {
    return {
      kind: "response",
      title: "Beantwoord je examenvoorstel",
      body: "Er staat een examenmoment klaar. Bevestig of wijs het af voordat het verloopt.",
      ctaLabel: "Bekijk voorstel",
      href: "#openstaande-acties",
    };
  }

  if (input.lessonProposalCount > 0) {
    return {
      kind: "response",
      title: "Beantwoord je lesvoorstel",
      body: "Je rijschool heeft een lesmoment voorgesteld. Laat weten of dit moment past.",
      ctaLabel: "Bekijk voorstel",
      href: "#openstaande-acties",
    };
  }

  if (input.overdueInvoiceCount > 0) {
    return {
      kind: "payment",
      title: "Rond je openstaande betaling af",
      body: "Er is een factuur over de betaaldatum. Bekijk het openstaande bedrag en de betaalmogelijkheden.",
      ctaLabel: "Naar betalingen",
      href: "/leerling/betalingen",
    };
  }

  if (input.nextLesson) {
    const now = Date.parse(input.nowIso);
    const startsAt = Date.parse(input.nextLesson.startsAt);
    const untilLesson = startsAt - now;
    if (
      Number.isFinite(untilLesson) &&
      untilLesson >= 0 &&
      untilLesson <= UPCOMING_LESSON_WINDOW_MS
    ) {
      return {
        kind: "lesson",
        title: "Bereid je volgende les voor",
        body: "Je volgende les begint binnen 24 uur. Controleer tijd, locatie en aandachtspunten.",
        ctaLabel: "Bekijk les",
        href: input.nextLesson.href,
      };
    }
  }

  if (input.creditAvailableMinutes <= 0) {
    return {
      kind: "payment",
      title: "Vul je lestegoed aan",
      body: "Je hebt geen beschikbaar lestegoed meer. Regel je vervolg voordat je nieuwe lessen plant.",
      ctaLabel: "Bekijk tegoed",
      href: "/leerling/betalingen",
    };
  }

  if (!input.cbr.authorizationReceived) {
    return {
      kind: "cbr",
      title: "Regel je CBR-machtiging",
      body: "Je rijschool kan pas een examen aanvragen wanneer je machtiging is ontvangen.",
      ctaLabel: "Open CBR-checklist",
      href: "/leerling/examens",
    };
  }

  if (
    input.cbr.healthDeclarationRequired &&
    !input.cbr.healthDeclarationDone
  ) {
    return {
      kind: "cbr",
      title: "Rond je gezondheidsverklaring af",
      body: "Deze CBR-voorwaarde staat nog open en kan je examenplanning blokkeren.",
      ctaLabel: "Open CBR-checklist",
      href: "/leerling/examens",
    };
  }

  if (!input.nextLesson) {
    return {
      kind: "planning",
      title: "Plan je volgende les",
      body: "Er staat nog geen vervolgles gepland. Houd je lesritme vast door een nieuw moment te kiezen.",
      ctaLabel: "Naar lessen",
      href: "/leerling/lessen",
    };
  }

  if (!input.cbr.theoryDone) {
    return {
      kind: "theory",
      title: "Werk verder aan je theorie",
      body: "Je theorie staat nog niet als behaald geregistreerd. Bekijk je status en eventuele opdrachten.",
      ctaLabel: "Naar theorie",
      href: "/leerling/theorie",
    };
  }

  if (input.creditAvailableMinutes < 120) {
    return {
      kind: "payment",
      title: "Je lestegoed is bijna op",
      body: "Je hebt minder dan twee lesuren beschikbaar. Controleer op tijd je pakket of betaling.",
      ctaLabel: "Bekijk tegoed",
      href: "/leerling/betalingen",
    };
  }

  return {
    kind: "practice",
    title: input.fallback.title,
    body: input.fallback.body,
    ctaLabel: "Bekijk plan",
    href: input.fallback.href,
  };
}
