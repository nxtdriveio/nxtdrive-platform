import type { FeatureAvailability, MapsFeatureCode } from "../domain/types";

export type UsageWindow = Readonly<{
  usedUnits: number;
  limitUnits: number | null;
  forecastUnits: number | null;
}>;

export type LimitPolicy = Readonly<{
  warningPercent: number;
  degradationPercent: number;
  hardPercent: number;
  degradedMode: FeatureAvailability["mode"];
}>;

export function evaluateLimit(input: {
  featureCode: MapsFeatureCode;
  requestedUnits: number;
  usage: UsageWindow;
  policy: LimitPolicy;
  featureEnabled: boolean;
}): FeatureAvailability {
  if (!input.featureEnabled) {
    return availability(
      input.featureCode,
      "DISABLED",
      "MANUAL",
      "FEATURE_DISABLED",
      0,
    );
  }
  if (input.requestedUnits < 0 || !Number.isSafeInteger(input.requestedUnits)) {
    throw new Error(
      "Aangevraagde units moeten een niet-negatief geheel getal zijn.",
    );
  }
  const limit = input.usage.limitUnits;
  if (limit === null) {
    return availability(
      input.featureCode,
      "ENABLED",
      "PROVIDER",
      "WITHIN_LIMIT",
      null,
    );
  }
  const projected = input.usage.usedUnits + input.requestedUnits;
  const percent = limit === 0 ? 100 : (projected / limit) * 100;
  const remaining = Math.max(0, limit - input.usage.usedUnits);
  if (percent >= input.policy.hardPercent) {
    return availability(
      input.featureCode,
      "LIMIT_REACHED",
      input.policy.degradedMode,
      "HARD_LIMIT_REACHED",
      remaining,
    );
  }
  if (
    percent >= input.policy.degradationPercent ||
    (input.usage.forecastUnits ?? 0) > limit
  ) {
    return availability(
      input.featureCode,
      "DEGRADED",
      input.policy.degradedMode,
      (input.usage.forecastUnits ?? 0) > limit
        ? "FORECAST_LIMIT_EXCEEDED"
        : "DEGRADATION_THRESHOLD_REACHED",
      remaining,
    );
  }
  return availability(
    input.featureCode,
    "ENABLED",
    "PROVIDER",
    percent >= input.policy.warningPercent
      ? "WARNING_THRESHOLD_REACHED"
      : "WITHIN_LIMIT",
    remaining,
  );
}

export type TierPrice = Readonly<{
  upToUnits: number | null;
  unitPriceMicros: number;
}>;

export type CostBreakdown = Readonly<{
  grossMicros: number;
  allocatedMicros: number;
  actualAccountMicros: number | null;
  allocationMethod:
    | "GROSS"
    | "PRO_RATA"
    | "INCLUDED_BUNDLE"
    | "FIXED_PLUS_OVERAGE";
  isEstimate: boolean;
}>;

export function calculateTieredGrossCost(
  units: number,
  tiers: readonly TierPrice[],
): number {
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new Error("Units moeten een niet-negatief geheel getal zijn.");
  }
  let remaining = units;
  let lowerBound = 0;
  let total = 0;
  for (const tier of tiers) {
    if (tier.unitPriceMicros < 0)
      throw new Error("Een prijs kan niet negatief zijn.");
    const capacity =
      tier.upToUnits === null
        ? remaining
        : Math.max(0, tier.upToUnits - lowerBound);
    const consumed = Math.min(remaining, capacity);
    total += consumed * tier.unitPriceMicros;
    remaining -= consumed;
    lowerBound = tier.upToUnits ?? lowerBound + consumed;
    if (remaining === 0) break;
  }
  if (remaining > 0)
    throw new Error("Prijsstaffels dekken het gebruik niet volledig.");
  return total;
}

export function allocateCost(input: {
  grossMicros: number;
  actualAccountMicros?: number | null;
  method: CostBreakdown["allocationMethod"];
  tenantShare?: number;
  includedBundleMicros?: number;
  fixedMicros?: number;
}): CostBreakdown {
  if (input.grossMicros < 0)
    throw new Error("Brutokosten kunnen niet negatief zijn.");
  const share = input.tenantShare ?? 1;
  if (share < 0 || share > 1)
    throw new Error("Tenantdeel moet tussen nul en één liggen.");
  const allocatedMicros =
    input.method === "GROSS"
      ? input.grossMicros
      : input.method === "PRO_RATA"
        ? Math.round((input.actualAccountMicros ?? input.grossMicros) * share)
        : input.method === "INCLUDED_BUNDLE"
          ? Math.max(0, input.grossMicros - (input.includedBundleMicros ?? 0))
          : (input.fixedMicros ?? 0) +
            Math.max(0, input.grossMicros - (input.includedBundleMicros ?? 0));
  return Object.freeze({
    grossMicros: input.grossMicros,
    allocatedMicros,
    actualAccountMicros: input.actualAccountMicros ?? null,
    allocationMethod: input.method,
    isEstimate: input.actualAccountMicros == null,
  });
}

function availability(
  featureCode: MapsFeatureCode,
  state: FeatureAvailability["state"],
  mode: FeatureAvailability["mode"],
  reason: string,
  remainingUnits: number | null,
): FeatureAvailability {
  return Object.freeze({ featureCode, state, mode, reason, remainingUnits });
}
