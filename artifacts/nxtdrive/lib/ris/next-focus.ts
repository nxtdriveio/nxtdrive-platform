export type NextFocusCandidate = Readonly<{
  scriptId: string;
  code: string;
  title: string;
  moduleNumber: number;
  instructionStage?: number | null;
  performanceOutcome?:
    | "NOT_OBSERVED"
    | "ATTENTION_REQUIRED"
    | "DEVELOPING"
    | "SUFFICIENT"
    | "STABLE"
    | null;
  safetyStatus?:
    | "NOT_ASSESSED"
    | "NO_BLOCKER"
    | "ATTENTION"
    | "BLOCKER"
    | null;
  isCritical?: boolean;
  isAttentionPoint?: boolean;
  shouldRepeat?: boolean;
  wasFocus?: boolean;
}>;

export type NextFocusRecommendation = Readonly<{
  scriptId: string;
  title: string;
  reason: string;
  priority: number;
}>;

export type NextFocusProposal = Readonly<{
  recommendations: readonly NextFocusRecommendation[];
  learnerWish: string | null;
  explanation: string;
}>;

function normalizedTokens(value: string): string[] {
  return value
    .toLocaleLowerCase("nl-NL")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function wishMatch(candidate: NextFocusCandidate, learnerWish: string | null) {
  if (!learnerWish) return false;
  const wish = new Set(normalizedTokens(learnerWish));
  return normalizedTokens(`${candidate.code} ${candidate.title}`).some((token) =>
    wish.has(token),
  );
}

function rankCandidate(
  candidate: NextFocusCandidate,
  learnerWish: string | null,
): NextFocusRecommendation {
  let priority = 0;
  const reasons: string[] = [];

  if (candidate.safetyStatus === "BLOCKER") {
    priority += 120;
    reasons.push("open veiligheidsblokkade");
  } else if (candidate.safetyStatus === "ATTENTION") {
    priority += 100;
    reasons.push("veiligheidsaandacht");
  } else if (
    candidate.isCritical &&
    (!candidate.safetyStatus || candidate.safetyStatus === "NOT_ASSESSED")
  ) {
    priority += 85;
    reasons.push("kritieke veiligheid nog niet aangetoond");
  }

  if (candidate.isAttentionPoint) {
    priority += 70;
    reasons.push("aandachtspunt uit de laatste beoordeling");
  }
  if (candidate.shouldRepeat) {
    priority += 55;
    reasons.push("herhaling geadviseerd");
  }
  if (candidate.performanceOutcome === "ATTENTION_REQUIRED") {
    priority += 60;
    reasons.push("beheersing vraagt aandacht");
  } else if (candidate.performanceOutcome === "DEVELOPING") {
    priority += 40;
    reasons.push("beheersing is in ontwikkeling");
  } else if (
    candidate.performanceOutcome === "NOT_OBSERVED" ||
    (candidate.performanceOutcome == null && candidate.instructionStage == null)
  ) {
    priority += 25;
    reasons.push("nog niet aantoonbaar beoordeeld");
  }
  if (candidate.wasFocus) {
    priority += 15;
    reasons.push("continuïteit met de vorige focus");
  }
  if (wishMatch(candidate, learnerWish)) {
    priority += 65;
    reasons.push("sluit aan op de leerwens");
  }

  return {
    scriptId: candidate.scriptId,
    title: `${candidate.code} - ${candidate.title}`,
    reason: reasons.slice(0, 2).join(" en ") || "logische vervolgstap",
    priority,
  };
}

export function buildNextFocusProposal(input: {
  candidates: readonly NextFocusCandidate[];
  learnerWish?: string | null;
  minimum?: number;
  maximum?: number;
}): NextFocusProposal {
  const learnerWish = input.learnerWish?.trim() || null;
  const minimum = Math.max(2, input.minimum ?? 2);
  const maximum = Math.max(minimum, Math.min(4, input.maximum ?? 4));
  const recommendations = input.candidates
    .map((candidate) => rankCandidate(candidate, learnerWish))
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.title.localeCompare(right.title, "nl-NL"),
    )
    .filter((item, index) => item.priority > 0 || index < minimum)
    .slice(0, maximum);

  return {
    recommendations,
    learnerWish,
    explanation: learnerWish
      ? "Gebaseerd op veiligheidsblokkades, beoordeling, dekking, continuïteit en de leerwens van de leerling."
      : "Gebaseerd op veiligheidsblokkades, beoordeling, dekking en continuïteit.",
  };
}
