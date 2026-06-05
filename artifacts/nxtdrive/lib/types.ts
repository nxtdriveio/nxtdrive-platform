export type MemberRole =
  | "tenant_admin"
  | "instructor"
  | "student"
  | "parent"
  | "branch_manager"
  | "planner"
  | "admin_staff"
  | "marketing"
  | "franchise_admin";

export type OrgType =
  | "zzp"
  | "rijschool"
  | "groot"
  | "multi_vestiging"
  | "franchise";

export type TenantPlan = "start" | "pro" | "elite";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  white_label_enabled: boolean;
  org_type?: OrgType;
  parent_tenant_id?: string | null;
};

export type FranchiseTemplate = {
  id: string;
  tenant_id: string;
  template_type: "package";
  name: string;
  config: {
    credits_total?: number;
    price_cents?: number;
    valid_days?: number | null;
    description?: string;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FranchiseTemplateActivation = {
  id: string;
  franchise_template_id: string;
  franchisee_tenant_id: string;
  activated_at: string;
  activated_by: string | null;
  resulting_package_id: string | null;
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
  welcome_message: string | null;
};

export type TenantDomainType = "subdomain" | "custom";

export type TenantDomainStatus = "pending" | "active" | "failed";

export type TenantDomain = {
  id: string;
  tenant_id: string;
  hostname: string;
  type: TenantDomainType;
  status: TenantDomainStatus;
  verification_token: string;
  is_primary: boolean;
  verified_at: string | null;
  created_at: string;
};

export type CancellationTier = {
  hours_before: number;
  refund_pct: number;
};

export type CancellationPolicy = {
  tiers: CancellationTier[];
};
