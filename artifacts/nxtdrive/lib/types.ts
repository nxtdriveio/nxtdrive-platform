export type MemberRole = "tenant_admin" | "instructor" | "student" | "parent";

export type TenantPlan = "start" | "pro" | "elite";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  white_label_enabled: boolean;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_platform_admin: boolean;
  created_at: string;
};

export type Membership = {
  id: string;
  user_id: string;
  tenant_id: string;
  role: MemberRole;
  created_at: string;
  tenant?: Tenant;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  profile: Profile | null;
  memberships: Array<Membership & { tenant: Tenant }>;
};

export type TenantBranding = {
  tenant_id: string;
  logo_url: string | null;
  primary_color: string | null;
  primary_foreground: string | null;
  custom_domain: string | null;
};

export type CancellationTier = {
  hours_before: number;
  refund_pct: number;
};

export type CancellationPolicy = {
  tiers: CancellationTier[];
};
