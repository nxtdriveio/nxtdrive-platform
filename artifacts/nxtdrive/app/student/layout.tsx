import { requireActiveTenant } from "@/lib/auth/require-role";
import { StudentTopBar } from "@/components/student/TopBar";
import { StudentBottomNav } from "@/components/student/BottomNav";

export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Parent role is intentionally excluded until a parent↔student linkage model
  // exists (see Phase 2G). Without it, parents would inherit tenant-wide
  // student/lesson visibility via `students_select_members`.
  const { user, tenant } = await requireActiveTenant(["student"]);
  const userLabel = user.profile?.full_name ?? user.email ?? "Leerling";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <StudentTopBar tenantName={tenant.name} userLabel={userLabel} />
      <main className="flex-1 px-3 py-4 pb-20 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
      <StudentBottomNav />
    </div>
  );
}
