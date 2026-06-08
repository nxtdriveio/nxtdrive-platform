import Link from "next/link";
import {
  Building2,
  MapPin,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { listBranches } from "@/lib/branches/service";
import { requireOrganizationPermission } from "@/lib/organization";
import { loadOrganizationProfile } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";
import { saveOrganizationProfileAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MembershipRow = {
  id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
};

const STAFF_ROLES: MemberRole[] = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
];

const ROLE_LABEL: Record<MemberRole, string> = {
  tenant_admin: "Organisatiebeheerder",
  franchise_admin: "Franchisebeheerder",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
  instructor: "Instructeur",
  student: "Leerling",
  parent: "Ouder",
};

const ORG_TYPE_LABEL: Record<string, string> = {
  zzp: "ZZP instructeur",
  rijschool: "Rijschool",
  groot: "Grote rijschool",
  multi_vestiging: "Multi-vestiging",
  franchise: "Franchise",
};

const PLAN_LABEL: Record<string, string> = {
  start: "Start",
  pro: "Pro",
  elite: "Elite",
};

const LIFECYCLE_LABEL: Record<string, string> = {
  prospect: "Prospect",
  onboarding: "Onboarding",
  active: "Actief",
  paused: "Gepauzeerd",
  churned: "Gestopt",
};

const ONBOARDING_LABEL: Record<string, string> = {
  not_started: "Niet gestart",
  in_progress: "In uitvoering",
  ready: "Klaar",
  blocked: "Geblokkeerd",
};

function Feedback({
  profile,
  code,
  reason,
}: {
  profile: string | null;
  code: string | null;
  reason: string | null;
}) {
  if (profile === "saved") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Organisatieprofiel opgeslagen.
      </p>
    );
  }

  if (profile !== "error") return null;

  const messages: Record<string, string> = {
    invalid_owner: "Kies een eigenaar die medewerker is binnen deze organisatie.",
    owner_lookup_failed: "Eigenaar kon niet worden gecontroleerd.",
    save_failed: "Organisatieprofiel opslaan mislukt.",
  };

  return (
    <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {messages[code ?? ""] ?? "Er is een fout opgetreden."}
      {reason ? ` ${reason}` : null}
    </p>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function SectionLinkCard({
  title,
  description,
  href,
  cta,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <span className="rounded-full bg-primary-soft p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <CardTitle className="text-foreground">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent>
        <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {cta}
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function OrganisatiePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganizationPermission(
    "organization:update",
  );
  const sp = await searchParams;
  const profileFeedback = typeof sp.profile === "string" ? sp.profile : null;
  const code = typeof sp.code === "string" ? sp.code : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;

  const service = createServiceRoleClient();
  const [profile, branches, membershipsResult] = await Promise.all([
    loadOrganizationProfile(service, organization.id),
    listBranches(service, organization.id),
    service
      .from("memberships")
      .select("id, user_id, role, created_at")
      .eq("tenant_id", organization.id)
      .in("role", STAFF_ROLES)
      .order("created_at", { ascending: true }),
  ]);

  if (membershipsResult.error) {
    throw new Error(
      `Kon medewerkers niet laden: ${membershipsResult.error.message}`,
    );
  }

  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const staffUserIds = Array.from(new Set(memberships.map((m) => m.user_id)));
  const profileRowsResult = staffUserIds.length
    ? await service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", staffUserIds)
    : { data: [] as ProfileRow[], error: null };

  if (profileRowsResult.error) {
    throw new Error(
      `Kon medewerkerprofielen niet laden: ${profileRowsResult.error.message}`,
    );
  }

  const profileRows = (profileRowsResult.data ?? []) as ProfileRow[];
  const profileMap = new Map(profileRows.map((row) => [row.id, row]));
  const owner = profile?.owner_user_id
    ? profileMap.get(profile.owner_user_id)
    : null;
  const activeBranches = branches.filter((branch) => branch.is_active).length;
  const roleCounts = memberships.reduce<Record<string, number>>((acc, row) => {
    acc[row.role] = (acc[row.role] ?? 0) + 1;
    return acc;
  }, {});
  const completedProfileFields = [
    profile?.legal_name,
    profile?.billing_email,
    profile?.support_email,
    profile?.kvk_number,
    profile?.vat_number,
    profile?.owner_user_id,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">Organisatie</Badge>
            <Badge variant="outline">
              {ORG_TYPE_LABEL[organization.org_type ?? ""] ?? "Type onbekend"}
            </Badge>
            <Badge variant="outline">
              {PLAN_LABEL[organization.plan] ?? organization.plan}
            </Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Organisatiebeheer
            </h1>
            <p className="text-sm text-muted-foreground">
              Beheer de hoogste operationele laag van {organization.name}: profiel,
              vestigingen, medewerkers, rollen en straks teams.
            </p>
          </div>
        </div>
        <Link
          href="/backoffice/instellingen"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Naar instellingen
        </Link>
      </div>

      <Feedback profile={profileFeedback} code={code} reason={reason} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Profiel"
          value={`${completedProfileFields}/6`}
          description="Ingevulde organisatievelden voor administratie en ownership."
          icon={Building2}
        />
        <StatCard
          title="Vestigingen"
          value={`${activeBranches}/${branches.length}`}
          description="Actieve vestigingen binnen deze organisatiecontainer."
          icon={MapPin}
        />
        <StatCard
          title="Medewerkers"
          value={String(memberships.length)}
          description="Gebruikers met backoffice- of instructeursrollen."
          icon={Users}
        />
        <StatCard
          title="Teams"
          value="Voorbereid"
          description="Teams worden de configureerbare laag voor afdelingen."
          icon={Workflow}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Organisatieprofiel</CardTitle>
            <p className="text-sm text-muted-foreground">
              Dit profiel hoort bij de organisatie als klant en data-eigenaar.
              Vestigingen blijven optioneel en hangen hieronder.
            </p>
          </CardHeader>
          <CardContent>
            <form action={saveOrganizationProfileAction} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="legal_name">Juridische naam</Label>
                  <Input
                    id="legal_name"
                    name="legal_name"
                    defaultValue={profile?.legal_name ?? organization.name}
                    placeholder="Van Dijk Rijschool B.V."
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="owner_user_id">Organisatie-eigenaar</Label>
                  <select
                    id="owner_user_id"
                    name="owner_user_id"
                    defaultValue={profile?.owner_user_id ?? ""}
                    className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <option value="">Geen eigenaar gekozen</option>
                    {memberships.map((membership) => {
                      const row = profileMap.get(membership.user_id);
                      const label = row?.full_name || row?.email || membership.user_id;
                      return (
                        <option key={membership.id} value={membership.user_id}>
                          {label} - {ROLE_LABEL[membership.role] ?? membership.role}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billing_email">Facturatie e-mail</Label>
                  <Input
                    id="billing_email"
                    name="billing_email"
                    type="email"
                    defaultValue={profile?.billing_email ?? ""}
                    placeholder="administratie@rijschool.nl"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="support_email">Support e-mail</Label>
                  <Input
                    id="support_email"
                    name="support_email"
                    type="email"
                    defaultValue={profile?.support_email ?? ""}
                    placeholder="info@rijschool.nl"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kvk_number">KvK-nummer</Label>
                  <Input
                    id="kvk_number"
                    name="kvk_number"
                    defaultValue={profile?.kvk_number ?? ""}
                    placeholder="12345678"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vat_number">BTW-nummer</Label>
                  <Input
                    id="vat_number"
                    name="vat_number"
                    defaultValue={profile?.vat_number ?? ""}
                    placeholder="NL123456789B01"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <span>
                  Lifecycle: <strong className="text-foreground">{LIFECYCLE_LABEL[profile?.lifecycle_status ?? "onboarding"]}</strong>
                </span>
                <span>
                  Onboarding: <strong className="text-foreground">{ONBOARDING_LABEL[profile?.onboarding_status ?? "in_progress"]}</strong>
                </span>
                <span>
                  Eigenaar: <strong className="text-foreground">{owner?.full_name || owner?.email || "niet gekozen"}</strong>
                </span>
              </div>

              <button
                type="submit"
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                Organisatieprofiel opslaan
              </button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <SectionLinkCard
            title="Vestigingen"
            description="Maak locaties aan, zet ze actief/inactief en gebruik ze als scope voor planning, voertuigen, facturen en taken."
            href="/backoffice/instellingen/vestigingen"
            cta="Vestigingen beheren"
            icon={MapPin}
          />
          <SectionLinkCard
            title="Medewerkers en rollen"
            description="Nodig medewerkers uit met tijdelijke wachtwoorden, wijs rollen toe en beperk toegang per vestiging."
            href="/backoffice/medewerkers"
            cta="Medewerkers beheren"
            icon={Users}
          />
          <Card className="border-dashed">
            <CardHeader className="flex-row items-start gap-3">
              <span className="rounded-full bg-primary-soft p-2 text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <CardTitle className="text-foreground">Teams</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Teams zijn voorbereid als organisatielaag voor Planning,
                  Administratie, Marketing en Management. Beheerbare teams worden
                  in de volgende Sprint 5-slice aan dit scherm gekoppeld.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {["Planning", "Administratie", "Marketing", "Theorie", "Management"].map((team) => (
                  <Badge key={team} variant="outline">
                    {team}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Rollenoverzicht</CardTitle>
          <p className="text-sm text-muted-foreground">
            Snelle sanity check van de huidige backoffice-rollen binnen deze organisatie.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STAFF_ROLES.map((role) => (
              <div
                key={role}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
                <Badge variant={roleCounts[role] ? "primary" : "outline"}>
                  {roleCounts[role] ?? 0}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
