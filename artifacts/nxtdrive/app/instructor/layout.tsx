import { requireActiveTenant } from "@/lib/auth/require-role";
import { InstructorTopBar } from "@/components/instructor/TopBar";

export const dynamic = "force-dynamic";

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const userLabel = user.profile?.full_name ?? user.email ?? "Instructeur";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <InstructorTopBar tenantName={tenant.name} userLabel={userLabel} />
      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
