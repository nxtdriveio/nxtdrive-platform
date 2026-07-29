import "server-only";

import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getServerSupabaseAnonKey,
  getServerSupabaseUrl,
} from "@/lib/supabase/env";
import type { MemberRole, Tenant } from "@/lib/types";

const ALLOWED_ROLES = new Set<MemberRole>(["instructor", "tenant_admin"]);
const BEARER_RE = /^Bearer ([A-Za-z0-9._~-]{20,8192})$/;

export class MobileApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

type MobileMembership = {
  id: string;
  tenant_id: string;
  role: MemberRole;
  branch_scope_type: string | null;
  tenant: Tenant;
};

export type MobileInstructorContext = {
  user: User;
  tenant: Tenant;
  roles: MemberRole[];
  tenants: Tenant[];
  service: SupabaseClient;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  branchIds: "all" | string[];
};

export function createMobileAuthClient(accessToken?: string) {
  const { url } = getServerSupabaseUrl();
  return createClient(url, getServerSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

export function sessionEnvelope(session: Session, user: User, tenant: Tenant) {
  if (!session.access_token || !session.refresh_token || !session.expires_at) {
    throw new MobileApiError(
      503,
      "De authenticatieserver gaf een onvolledige sessie terug.",
      "incomplete_session",
    );
  }
  return {
    session: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAtEpochSeconds: session.expires_at,
    },
    user: {
      id: user.id,
      email: user.email ?? "",
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
    },
  };
}

export async function resolveMobileInstructorContext(
  user: User,
  requestedTenantId?: string | null,
): Promise<MobileInstructorContext> {
  const service = createServiceRoleClient();
  const [{ data: membershipsRaw, error: membershipsError }, { data: profile }] =
    await Promise.all([
      service
        .from("memberships")
        .select(
          "id, tenant_id, role, branch_scope_type, tenant:tenants(id, slug, name, plan, white_label_enabled, timezone, org_type, parent_tenant_id)",
        )
        .eq("user_id", user.id),
      service
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
  if (membershipsError) {
    throw new MobileApiError(
      503,
      "Je rijschooltoegang kon niet worden gecontroleerd.",
      "membership_unavailable",
    );
  }

  const memberships = (
    (membershipsRaw ?? []) as unknown as MobileMembership[]
  ).filter(
    (membership) =>
      ALLOWED_ROLES.has(membership.role) && Boolean(membership.tenant?.id),
  );
  const tenantById = new Map(
    memberships.map((membership) => [membership.tenant.id, membership.tenant]),
  );
  const tenants = Array.from(tenantById.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "nl-NL"),
  );
  if (tenants.length === 0) {
    throw new MobileApiError(
      403,
      "Dit account heeft geen toegang tot de instructeursapp.",
      "instructor_access_required",
    );
  }

  const tenant = requestedTenantId
    ? tenantById.get(requestedTenantId)
    : tenants[0];
  if (!tenant) {
    throw new MobileApiError(
      403,
      "Je hebt geen instructeurstoegang tot deze rijschool.",
      "tenant_access_denied",
    );
  }
  const roles = memberships
    .filter((membership) => membership.tenant_id === tenant.id)
    .map((membership) => membership.role);
  const activeMemberships = memberships.filter(
    (membership) => membership.tenant_id === tenant.id,
  );
  const organizationWide =
    roles.includes("tenant_admin") ||
    activeMemberships.some(
      (membership) => membership.branch_scope_type !== "branches",
    );
  let branchIds: "all" | string[] = "all";
  if (!organizationWide) {
    const { data: branchRows, error: branchError } = await service
      .from("membership_branches")
      .select("branch_id")
      .in(
        "membership_id",
        activeMemberships.map((membership) => membership.id),
      );
    if (branchError) {
      throw new MobileApiError(
        503,
        "Je vestigingstoegang kon niet worden gecontroleerd.",
        "branch_access_unavailable",
      );
    }
    branchIds = Array.from(
      new Set(
        ((branchRows ?? []) as Array<{ branch_id: string }>).map(
          (row) => row.branch_id,
        ),
      ),
    );
  }

  const isPlatformAdmin = Boolean(
    (profile as { is_platform_admin?: boolean } | null)?.is_platform_admin,
  );

  return {
    user,
    tenant,
    roles,
    tenants,
    service,
    branchIds,
    isAdmin: roles.includes("tenant_admin") || isPlatformAdmin,
    isPlatformAdmin,
  };
}

export async function requireMobileInstructor(
  request: NextRequest,
): Promise<MobileInstructorContext> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = BEARER_RE.exec(authorization);
  if (!match?.[1]) {
    throw new MobileApiError(
      401,
      "Je sessie ontbreekt. Log opnieuw in.",
      "missing_session",
    );
  }

  const auth = createMobileAuthClient(match[1]);
  const { data, error } = await auth.auth.getUser(match[1]);
  if (error || !data.user) {
    throw new MobileApiError(
      401,
      "Je sessie is verlopen of ingetrokken.",
      "invalid_session",
    );
  }
  return resolveMobileInstructorContext(
    data.user,
    request.headers.get("x-nxtdrive-tenant-id"),
  );
}

export function mobileError(error: unknown) {
  if (error instanceof MobileApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  console.error("[mobile-api] unexpected error", error);
  return Response.json(
    {
      error: "NXTDRIVE is tijdelijk niet beschikbaar. Probeer het opnieuw.",
      code: "unexpected_error",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
