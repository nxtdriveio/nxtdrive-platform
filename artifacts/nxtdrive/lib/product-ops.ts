import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole, Tenant } from "@/lib/types";

export const PRODUCT_OPS_ROLES: MemberRole[] = [
  "tenant_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "franchise_admin",
];

export type SupportTicket = {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  source: string;
  requester_user_id: string | null;
  assigned_user_id: string | null;
  last_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  comments?: SupportComment[];
};

export type SupportComment = {
  id: string;
  ticket_id: string;
  tenant_id: string;
  author_user_id: string | null;
  visibility: string;
  body: string;
  created_at: string;
};

export type Checklist = {
  id: string;
  slug: string;
  title: string;
  description: string;
  checklist_type: "onboarding" | "monitoring" | "go_live";
  sort_order: number;
  items: ChecklistItem[];
};

export type ChecklistItem = {
  id: string;
  checklist_id: string;
  slug: string;
  title: string;
  description: string;
  owner_role: string;
  evidence_hint: string | null;
  sort_order: number;
  is_required: boolean;
  status?: TenantChecklistStatus | null;
};

export type TenantChecklistStatus = {
  id: string;
  checklist_item_id: string;
  status: "not_started" | "in_progress" | "done" | "blocked" | "not_applicable";
  note: string | null;
  evidence_url: string | null;
  updated_at: string;
  completed_at: string | null;
};

export type ProductRelease = {
  id: string;
  version: string;
  title: string;
  summary: string;
  status: "draft" | "staging" | "production" | "archived";
  audience: string;
  staging_merged_at: string | null;
  production_released_at: string | null;
  created_at: string;
  updated_at: string;
  product_release_items?: ProductReleaseItem[];
  acknowledged?: boolean;
};

export type ProductReleaseItem = {
  id: string;
  release_id: string;
  item_type: string;
  title: string;
  description: string;
  surface: string;
  sort_order: number;
};

export type RoadmapItem = {
  id: string;
  title: string;
  description: string;
  category: "now" | "next" | "later" | "ideas" | "launched" | "not_planned";
  status: string;
  surface: string;
  priority: string;
  target_period: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  ownInterest?: RoadmapInterest | null;
  interestCount?: number;
};

export type RoadmapInterest = {
  id: string;
  roadmap_item_id: string;
  tenant_id: string;
  interest_level: "interested" | "important" | "critical";
  note: string | null;
};

export async function loadSupportCenter(tenantId: string) {
  const service = createServiceRoleClient();
  const [{ data: tickets }, { data: comments }] = await Promise.all([
    service
      .from("support_tickets")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(50),
    service
      .from("support_ticket_comments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  return {
    tickets: ((tickets ?? []) as SupportTicket[]).map((ticket) => ({
      ...ticket,
      comments: ((comments ?? []) as SupportComment[]).filter(
        (comment) => comment.ticket_id === ticket.id,
      ),
    })),
  };
}

export async function loadChecklistCenter(tenantId: string) {
  const service = createServiceRoleClient();
  const [{ data: checklists }, { data: statuses }] = await Promise.all([
    service
      .from("production_checklists")
      .select(
        "id, slug, title, description, checklist_type, sort_order, production_checklist_items(id, checklist_id, slug, title, description, owner_role, evidence_hint, sort_order, is_required)",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    service
      .from("tenant_checklist_item_statuses")
      .select("*")
      .eq("tenant_id", tenantId),
  ]);

  const statusMap = new Map(
    ((statuses ?? []) as TenantChecklistStatus[]).map((status) => [
      status.checklist_item_id,
      status,
    ]),
  );

  return (
    (checklists ?? []) as Array<
      Omit<Checklist, "items"> & {
        production_checklist_items?: ChecklistItem[];
      }
    >
  ).map((checklist) => ({
    ...checklist,
    items: (checklist.production_checklist_items ?? [])
      .map((item) => ({
        ...item,
        status: statusMap.get(item.id) ?? null,
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
  })) as Checklist[];
}

export async function loadReleaseCenter(
  tenant: Tenant,
  isPlatformAdmin: boolean,
) {
  const service = createServiceRoleClient();
  let query = service
    .from("product_releases")
    .select(
      "id, version, title, summary, status, audience, staging_merged_at, production_released_at, created_at, updated_at, product_release_items(id, release_id, item_type, title, description, surface, sort_order)",
    )
    .order("created_at", { ascending: false });

  if (!isPlatformAdmin) {
    query = query.in("status", ["staging", "production"]);
  }

  const [{ data: releases }, { data: acknowledgements }] = await Promise.all([
    query,
    service
      .from("tenant_release_acknowledgements")
      .select("release_id, acknowledged_at")
      .eq("tenant_id", tenant.id),
  ]);

  const acknowledged = new Set(
    ((acknowledgements ?? []) as Array<{ release_id: string }>).map(
      (ack) => ack.release_id,
    ),
  );

  return {
    releases: ((releases ?? []) as ProductRelease[]).map((release) => ({
      ...release,
      product_release_items: (release.product_release_items ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
      acknowledged: acknowledged.has(release.id),
    })),
  };
}

export async function loadRoadmapCenter(tenantId: string) {
  const service = createServiceRoleClient();
  const [{ data: items }, { data: interests }] = await Promise.all([
    service
      .from("product_roadmap_items")
      .select("*")
      .eq("is_public", true)
      .order("updated_at", { ascending: false }),
    service
      .from("product_roadmap_interest")
      .select("*")
      .eq("tenant_id", tenantId),
  ]);

  const ownInterest = new Map(
    ((interests ?? []) as RoadmapInterest[]).map((interest) => [
      interest.roadmap_item_id,
      interest,
    ]),
  );

  const counts = new Map<string, number>();
  if ((items ?? []).length > 0) {
    const { data: allInterests } = await service
      .from("product_roadmap_interest")
      .select("roadmap_item_id");
    for (const row of (allInterests ?? []) as Array<{
      roadmap_item_id: string;
    }>) {
      counts.set(
        row.roadmap_item_id,
        (counts.get(row.roadmap_item_id) ?? 0) + 1,
      );
    }
  }

  return {
    items: ((items ?? []) as RoadmapItem[]).map((item) => ({
      ...item,
      ownInterest: ownInterest.get(item.id) ?? null,
      interestCount: counts.get(item.id) ?? 0,
    })),
  };
}
