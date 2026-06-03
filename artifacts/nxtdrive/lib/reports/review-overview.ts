import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tenant-scoped aggregation of the INTERNAL review system (migration 0080).
 *
 * Feeds the "Reviewscore" card on the rapportagedashboard with real numbers:
 * average rating, total count, the 1–5 star distribution and one recent quoted
 * review (most recent review that actually has text).
 *
 * Strictly tenant-scoped: the caller passes an RLS-bound client (staff read the
 * whole tenant via the select policy) plus the tenant id, and every query is
 * filtered on `tenant_id` so a broad/cross-tenant client can never leak. Fails
 * loud on a real query error; degrades gracefully (neutral empty state) when a
 * tenant simply has no reviews yet.
 */

/** Star value → number of reviews with that rating. */
export type ReviewDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export type RecentReviewQuote = {
  rating: number;
  body: string;
  createdAt: string;
  /** First name only — friendly attribution without over-exposing PII. */
  studentFirstName: string | null;
};

export type ReviewOverview = {
  /** Total number of reviews in the tenant. */
  count: number;
  /** Mean rating rounded to one decimal, or null when there are no reviews. */
  average: number | null;
  /** Count per star value (1–5), always present (zeros when none). */
  distribution: ReviewDistribution;
  /** Most recent review that has text, or null. */
  recent: RecentReviewQuote | null;
};

function emptyDistribution(): ReviewDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function emptyOverview(): ReviewOverview {
  return {
    count: 0,
    average: null,
    distribution: emptyDistribution(),
    recent: null,
  };
}

function firstName(fullName: string | null | undefined): string | null {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/**
 * Loads the tenant's review aggregation. `client` must be tenant-scoped (RLS
 * applies); `tenantId` is enforced on every query as defence-in-depth.
 */
export async function loadTenantReviewOverview(
  client: SupabaseClient,
  tenantId: string,
): Promise<ReviewOverview> {
  const { data, error } = await client
    .from("student_reviews")
    .select("rating, body, created_at, student_id")
    .eq("tenant_id", tenantId);

  // Fail loud on a genuine query error — never silently pretend "no reviews".
  if (error) {
    throw new Error(`loadTenantReviewOverview failed: ${error.message}`);
  }

  const rows = (data ?? []) as {
    rating: number;
    body: string | null;
    created_at: string;
    student_id: string;
  }[];

  if (rows.length === 0) {
    return emptyOverview();
  }

  const distribution = emptyDistribution();
  let sum = 0;
  for (const r of rows) {
    const star = Math.min(5, Math.max(1, Math.round(r.rating))) as
      | 1
      | 2
      | 3
      | 4
      | 5;
    distribution[star] += 1;
    sum += r.rating;
  }

  const count = rows.length;
  const average = Math.round((sum / count) * 10) / 10;

  // Recent quote: newest review that actually has text.
  const withText = rows
    .filter((r) => (r.body ?? "").trim().length > 0)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  let recent: RecentReviewQuote | null = null;
  const top = withText[0];
  if (top) {
    // Resolve the first name via the same tenant-scoped client (students are
    // readable tenant-wide by staff under RLS). Best-effort: a missing name
    // just yields an anonymous quote, never an error.
    const { data: studentRow } = await client
      .from("students")
      .select("full_name")
      .eq("tenant_id", tenantId)
      .eq("id", top.student_id)
      .maybeSingle();
    recent = {
      rating: top.rating,
      body: (top.body ?? "").trim(),
      createdAt: top.created_at,
      studentFirstName: firstName(
        (studentRow as { full_name: string | null } | null)?.full_name,
      ),
    };
  }

  return { count, average, distribution, recent };
}
