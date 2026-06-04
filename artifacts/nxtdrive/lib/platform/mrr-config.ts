/**
 * Platform-level MRR configuration.
 * Prices are a flat monthly estimate per subscription tier.
 * No external payment data required — adjust here when prices change.
 */
export const MRR_CONFIG = {
  start: { label: "Start", monthlyEuros: 49 },
  pro: { label: "Pro", monthlyEuros: 99 },
  elite: { label: "Elite", monthlyEuros: 199 },
} as const;

export type Plan = keyof typeof MRR_CONFIG;

export type MrrTierRow = {
  plan: Plan;
  label: string;
  count: number;
  monthlyEuros: number;
  total: number;
};

export type MrrResult = {
  totalMonthly: number;
  annualised: number;
  byTier: MrrTierRow[];
};

/**
 * Pure function — computes estimated MRR from a list of tenant plan values.
 * Does not touch the database.
 */
export function computeMrr(tenants: { plan: string }[]): MrrResult {
  const counts = new Map<Plan, number>();

  for (const t of tenants) {
    const plan = t.plan as Plan;
    if (plan in MRR_CONFIG) {
      counts.set(plan, (counts.get(plan) ?? 0) + 1);
    }
  }

  const byTier: MrrTierRow[] = (Object.keys(MRR_CONFIG) as Plan[]).map(
    (plan) => ({
      plan,
      label: MRR_CONFIG[plan].label,
      count: counts.get(plan) ?? 0,
      monthlyEuros: MRR_CONFIG[plan].monthlyEuros,
      total: (counts.get(plan) ?? 0) * MRR_CONFIG[plan].monthlyEuros,
    }),
  );

  const totalMonthly = byTier.reduce((s, t) => s + t.total, 0);

  return {
    totalMonthly,
    annualised: totalMonthly * 12,
    byTier,
  };
}
