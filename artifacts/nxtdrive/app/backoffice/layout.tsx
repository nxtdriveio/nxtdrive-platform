import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTheme } from "@/lib/theme";
import { BackofficeSidebar } from "@/components/backoffice/sidebar";
import { BackofficeTopbar } from "@/components/backoffice/topbar";

export const dynamic = "force-dynamic";

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const theme = await getTheme();

  const userLabel = user.profile?.full_name ?? user.email ?? "Onbekend";
  const roleLabel = roles
    .map((r) => (r === "tenant_admin" ? "Beheerder" : "Instructeur"))
    .join(" + ");

  return (
    <div className="flex h-screen bg-background text-foreground">
      <BackofficeSidebar tenantName={tenant.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BackofficeTopbar
          userLabel={userLabel}
          roleLabel={roleLabel}
          theme={theme}
        />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
