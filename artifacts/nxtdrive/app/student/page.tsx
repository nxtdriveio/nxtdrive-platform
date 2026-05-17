import { requireActiveTenant } from "@/lib/auth/require-role";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const { user, tenant } = await requireActiveTenant(["student", "parent"]);

  return (
    <main className="min-h-screen p-8 bg-slate-50">
      <header className="flex items-center justify-between mb-8">
        <NxtdriveLogo />
        <div className="text-sm text-slate-600">
          {user.profile?.full_name ?? user.email} · {tenant.name}
        </div>
      </header>
      <h1 className="text-2xl font-semibold text-slate-900 mb-2">
        Mijn rijschool
      </h1>
      <p className="text-slate-600">
        Hier komen je lessen, voortgang en facturen.
      </p>
    </main>
  );
}
