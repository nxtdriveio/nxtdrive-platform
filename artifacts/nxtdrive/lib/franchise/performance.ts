import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadFranchiseOverview } from "@/lib/franchise/overview";

export type FranchisePerformanceWindow = {
  key: "current" | "previous" | "baseline";
  label: string;
  start_at: string;
  end_at: string;
};

export type FranchisePerformanceRow = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  branch_count: number;
  active_students: number;
  current_revenue_cents: number;
  previous_revenue_cents: number;
  baseline_revenue_cents: number;
  current_lessons: number;
  previous_lessons: number;
  baseline_lessons: number;
  revenue_delta_pct: number | null;
  lesson_delta: number;
  lead_conversion_rate: number | null;
  exam_pass_rate: number | null;
  capacity_utilisation: number | null;
  attention_label: string;
  attention_reason: string;
};

export type FranchisePerformanceOverview = {
  generated_at: string;
  windows: FranchisePerformanceWindow[];
  network: {
    franchisees: number;
    active_students: number;
    current_revenue_cents: number;
    previous_revenue_cents: number;
    baseline_revenue_cents: number;
    current_lessons: number;
    previous_lessons: number;
    baseline_lessons: number;
    revenue_delta_pct: number | null;
    lesson_delta: number;
    attention_count: number;
  };
  franchisees: FranchisePerformanceRow[];
  watchlists: {
    revenue_softness: FranchisePerformanceRow[];
    lesson_softness: FranchisePerformanceRow[];
    attention: FranchisePerformanceRow[];
  };
};

type WindowKey = FranchisePerformanceWindow["key"];

type TenantCounters = {
  current_revenue_cents: number;
  previous_revenue_cents: number;
  baseline_revenue_cents: number;
  current_lessons: number;
  previous_lessons: number;
  baseline_lessons: number;
};

function createCounters(): TenantCounters {
  return {
    current_revenue_cents: 0,
    previous_revenue_cents: 0,
    baseline_revenue_cents: 0,
    current_lessons: 0,
    previous_lessons: 0,
    baseline_lessons: 0,
  };
}

function bucketForDate(value: string | null, windows: FranchisePerformanceWindow[]): WindowKey | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  for (const window of windows) {
    const start = new Date(window.start_at).getTime();
    const end = new Date(window.end_at).getTime();
    if (time >= start && time < end) {
      return window.key;
    }
  }
  return null;
}

function percentageDelta(current: number, previous: number): number | null {
  if (previous <= 0) {
    return current > 0 ? 100 : null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function describeAttention(row: {
  current_revenue_cents: number;
  current_lessons: number;
  revenue_delta_pct: number | null;
  lead_conversion_rate: number | null;
  exam_pass_rate: number | null;
  capacity_utilisation: number | null;
}): { label: string; reason: string } {
  if (row.current_revenue_cents === 0 || row.current_lessons === 0) {
    return {
      label: "Direct aandacht",
      reason: "Geen omzet of lesactiviteit in de laatste 30 dagen.",
    };
  }

  if (row.revenue_delta_pct !== null && row.revenue_delta_pct <= -25) {
    return {
      label: "Terugval",
      reason: "Omzet is meer dan 25% lager dan in de vorige 30 dagen.",
    };
  }

  if (row.exam_pass_rate !== null && row.exam_pass_rate < 50) {
    return {
      label: "Kwaliteit",
      reason: "Slagingspercentage ligt onder de 50% en vraagt coaching.",
    };
  }

  if (row.capacity_utilisation !== null && row.capacity_utilisation < 40) {
    return {
      label: "Capaciteit",
      reason: "Bezetting is laag en wijst op vrije ruimte of vraaguitval.",
    };
  }

  if (row.lead_conversion_rate !== null && row.lead_conversion_rate < 20) {
    return {
      label: "Conversie",
      reason: "Leadconversie blijft achter ten opzichte van de rest van het netwerk.",
    };
  }

  return {
    label: "Gezond",
    reason: "Geen directe franchisebrede aandachtssignalen.",
  };
}

export async function loadFranchisePerformanceOverview(
  franchisegeverTenantId: string,
): Promise<FranchisePerformanceOverview> {
  const service = createServiceRoleClient();
  const now = new Date();

  const windows: FranchisePerformanceWindow[] = [
    {
      key: "current",
      label: "Laatste 30 dagen",
      start_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end_at: now.toISOString(),
    },
    {
      key: "previous",
      label: "31-60 dagen geleden",
      start_at: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      end_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      key: "baseline",
      label: "61-90 dagen geleden",
      start_at: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      end_at: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const oldestWindow = windows[2]?.start_at ?? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [overview, franchiseesRes, invoicesRes, lessonsRes] = await Promise.all([
    loadFranchiseOverview(franchisegeverTenantId),
    service
      .from("tenants")
      .select("id, name, slug")
      .eq("parent_tenant_id", franchisegeverTenantId)
      .order("name"),
    service
      .from("invoices")
      .select("tenant_id, total_cents_incl_vat, paid_at")
      .eq("status", "paid")
      .gte("paid_at", oldestWindow),
    service
      .from("lessons")
      .select("tenant_id, starts_at")
      .eq("status", "completed")
      .gte("starts_at", oldestWindow),
  ]);

  if (franchiseesRes.error) {
    throw new Error(`Franchisees voor prestaties laden mislukt: ${franchiseesRes.error.message}`);
  }

  if (invoicesRes.error) {
    throw new Error(`Facturen voor prestaties laden mislukt: ${invoicesRes.error.message}`);
  }

  if (lessonsRes.error) {
    throw new Error(`Lessen voor prestaties laden mislukt: ${lessonsRes.error.message}`);
  }

  const franchisees = franchiseesRes.data ?? [];
  const franchiseeIds = new Set(franchisees.map((tenant) => tenant.id as string));
  const countersByTenant = new Map<string, TenantCounters>();

  function tenantCounters(tenantId: string) {
    const existing = countersByTenant.get(tenantId);
    if (existing) return existing;
    const created = createCounters();
    countersByTenant.set(tenantId, created);
    return created;
  }

  for (const invoice of invoicesRes.data ?? []) {
    const tenantId = invoice.tenant_id as string;
    if (!franchiseeIds.has(tenantId)) continue;
    const bucket = bucketForDate(invoice.paid_at as string | null, windows);
    if (!bucket) continue;
    const counters = tenantCounters(tenantId);
    const amount = (invoice.total_cents_incl_vat as number | null) ?? 0;
    if (bucket === "current") counters.current_revenue_cents += amount;
    if (bucket === "previous") counters.previous_revenue_cents += amount;
    if (bucket === "baseline") counters.baseline_revenue_cents += amount;
  }

  for (const lesson of lessonsRes.data ?? []) {
    const tenantId = lesson.tenant_id as string;
    if (!franchiseeIds.has(tenantId)) continue;
    const bucket = bucketForDate(lesson.starts_at as string | null, windows);
    if (!bucket) continue;
    const counters = tenantCounters(tenantId);
    if (bucket === "current") counters.current_lessons += 1;
    if (bucket === "previous") counters.previous_lessons += 1;
    if (bucket === "baseline") counters.baseline_lessons += 1;
  }

  const overviewByTenant = new Map(
    overview.locations.map((location) => [location.tenant_id, location]),
  );

  const rows: FranchisePerformanceRow[] = franchisees.map((tenant) => {
    const tenantId = tenant.id as string;
    const counters = countersByTenant.get(tenantId) ?? createCounters();
    const current = overviewByTenant.get(tenantId);
    const attention = describeAttention({
      current_revenue_cents: counters.current_revenue_cents,
      current_lessons: counters.current_lessons,
      revenue_delta_pct: percentageDelta(counters.current_revenue_cents, counters.previous_revenue_cents),
      lead_conversion_rate: current?.lead_conversion_rate ?? null,
      exam_pass_rate: current?.exam_pass_rate ?? null,
      capacity_utilisation: current?.capacity_utilisation ?? null,
    });

    return {
      tenant_id: tenantId,
      tenant_name: (tenant.name as string) ?? current?.tenant_name ?? "Onbekende franchisee",
      tenant_slug: (tenant.slug as string) ?? current?.tenant_slug ?? "",
      branch_count: current?.branches.length ?? 0,
      active_students: current?.active_students ?? 0,
      current_revenue_cents: counters.current_revenue_cents,
      previous_revenue_cents: counters.previous_revenue_cents,
      baseline_revenue_cents: counters.baseline_revenue_cents,
      current_lessons: counters.current_lessons,
      previous_lessons: counters.previous_lessons,
      baseline_lessons: counters.baseline_lessons,
      revenue_delta_pct: percentageDelta(counters.current_revenue_cents, counters.previous_revenue_cents),
      lesson_delta: counters.current_lessons - counters.previous_lessons,
      lead_conversion_rate: current?.lead_conversion_rate ?? null,
      exam_pass_rate: current?.exam_pass_rate ?? null,
      capacity_utilisation: current?.capacity_utilisation ?? null,
      attention_label: attention.label,
      attention_reason: attention.reason,
    };
  });

  rows.sort((left, right) => {
    if (left.current_revenue_cents !== right.current_revenue_cents) {
      return right.current_revenue_cents - left.current_revenue_cents;
    }
    return right.current_lessons - left.current_lessons;
  });

  const network = {
    franchisees: rows.length,
    active_students: rows.reduce((sum, row) => sum + row.active_students, 0),
    current_revenue_cents: rows.reduce((sum, row) => sum + row.current_revenue_cents, 0),
    previous_revenue_cents: rows.reduce((sum, row) => sum + row.previous_revenue_cents, 0),
    baseline_revenue_cents: rows.reduce((sum, row) => sum + row.baseline_revenue_cents, 0),
    current_lessons: rows.reduce((sum, row) => sum + row.current_lessons, 0),
    previous_lessons: rows.reduce((sum, row) => sum + row.previous_lessons, 0),
    baseline_lessons: rows.reduce((sum, row) => sum + row.baseline_lessons, 0),
    revenue_delta_pct: percentageDelta(
      rows.reduce((sum, row) => sum + row.current_revenue_cents, 0),
      rows.reduce((sum, row) => sum + row.previous_revenue_cents, 0),
    ),
    lesson_delta: rows.reduce((sum, row) => sum + row.current_lessons, 0) - rows.reduce((sum, row) => sum + row.previous_lessons, 0),
    attention_count: rows.filter((row) => row.attention_label !== "Gezond").length,
  };

  return {
    generated_at: now.toISOString(),
    windows,
    network,
    franchisees: rows,
    watchlists: {
      revenue_softness: [...rows]
        .filter((row) => row.revenue_delta_pct !== null)
        .sort((left, right) => (left.revenue_delta_pct ?? 0) - (right.revenue_delta_pct ?? 0))
        .slice(0, 3),
      lesson_softness: [...rows]
        .sort((left, right) => left.lesson_delta - right.lesson_delta)
        .slice(0, 3),
      attention: [...rows]
        .filter((row) => row.attention_label !== "Gezond")
        .slice(0, 3),
    },
  };
}
