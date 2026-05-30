import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { StudentTopBar } from "@/components/student/TopBar";
import { StudentBottomNav } from "@/components/student/BottomNav";
import { getActiveStudent } from "@/lib/students/access";

export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Parents are admitted alongside students. RLS on students / lessons /
  // credit_ledger restricts a parent to rows linked via `student_guardians`,
  // so they cannot see other tenant data even though they share this layout.
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);

  const { student } = await getActiveStudent(user, tenant.id, roles);
  const isParent = roles.includes("parent") && !roles.includes("student");
  const userLabel = isParent
    ? student
      ? `Ouder · ${student.full_name}`
      : "Ouder"
    : user.profile?.full_name ?? user.email ?? "Leerling";

  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant.white_label_enabled, branding);

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <StudentTopBar
        tenantName={tenant.name}
        userLabel={userLabel}
        logoUrl={logoUrl}
      />
      <main className="flex-1 px-3 py-4 pb-20 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
      <StudentBottomNav />
    </BrandProvider>
  );
}
