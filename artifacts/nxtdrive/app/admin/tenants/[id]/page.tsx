import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enterTenantBackoffice } from "../../actions";
import { createTenantAdminAccount } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<string, string> = {
  start: "Start",
  pro: "Pro",
  elite: "Elite",
};

const PLAN_BADGE: Record<string, "outline" | "primary" | "default"> = {
  start: "outline",
  pro: "primary",
  elite: "default",
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Vul naam, e-mailadres en een wachtwoord van minimaal 8 tekens in.",
  create_failed: "Account aanmaken mislukt. Controleer het e-mailadres.",
  membership_failed: "Account aangemaakt maar lidmaatschap toevoegen mislukt. Neem contact op.",
};

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requirePlatformAdmin();

  const service = createServiceRoleClient();

  const [
    { data: tenant },
    { data: admins },
    { count: studentCount },
    { count: instructorCount },
    { count: leadCount },
  ] = await Promise.all([
    service.from("tenants").select("*").eq("id", id).single(),
    service
      .from("memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", id)
      .eq("role", "tenant_admin")
      .order("created_at", { ascending: true }),
    service
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", id),
    service
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", id)
      .eq("role", "instructor"),
    service
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", id),
  ]);

  if (!tenant) notFound();

  // Resolve admin profile names.
  let adminProfiles: { user_id: string; email: string; full_name: string }[] = [];
  if (admins && admins.length > 0) {
    const listResult = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const allUsers = (listResult.data?.users ?? []) as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>;
    adminProfiles = admins.map((m) => {
      const u = allUsers.find((u) => u.id === m.user_id);
      return {
        user_id: m.user_id,
        email: u?.email ?? "—",
        full_name: (u?.user_metadata?.full_name as string | undefined) ?? "—",
      };
    });
  }

  const createAction = createTenantAdminAccount.bind(null, id);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Admin
            </Link>
            <span className="text-muted-foreground">/</span>
            <NxtdriveLogo className="text-base" />
          </div>
          <Badge variant="primary" className="text-xs">
            platform admin
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Tenant header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {tenant.name}
              </h1>
              <Badge variant={PLAN_BADGE[tenant.plan as string] ?? "outline"}>
                {PLAN_LABELS[tenant.plan as string] ?? tenant.plan}
              </Badge>
              {tenant.white_label_enabled && (
                <Badge variant="outline">White-label</Badge>
              )}
            </div>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">
              {tenant.slug}.nxtdrive.io
            </p>
          </div>
          <form action={enterTenantBackoffice}>
            <input type="hidden" name="tenant_id" value={id} />
            <Button variant="outline" type="submit">
              Naar backoffice →
            </Button>
          </form>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Leerlingen", value: studentCount ?? 0 },
            { label: "Instructeurs", value: instructorCount ?? 0 },
            { label: "Leads", value: leadCount ?? 0 },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Existing admins */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tenant admins ({adminProfiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {adminProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen admins. Maak er een aan via het formulier.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {adminProfiles.map((a) => (
                    <li
                      key={a.user_id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {a.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.email}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        tenant admin
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Create admin form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin toevoegen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sp.created && (
                <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                  Account aangemaakt voor{" "}
                  <strong>{decodeURIComponent(sp.created)}</strong>.
                </div>
              )}
              {sp.error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {ERROR_MESSAGES[sp.error] ?? "Er is een fout opgetreden."}
                </div>
              )}

              <form action={createAction} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="full_name"
                    className="text-sm font-medium text-foreground"
                  >
                    Volledige naam <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder="Jan de Wit"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    E-mailadres <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="eigenaar@rijschool.nl"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Bestaat dit account al? Dan wordt het wachtwoord bijgewerkt
                    en het lidmaatschap toegevoegd.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    Wachtwoord <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Minimaal 8 tekens"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Admin aanmaken
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
