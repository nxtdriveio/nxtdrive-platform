import { requireActiveTenant } from "@/lib/auth/require-role";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

export const dynamic = "force-dynamic";

export default async function InstructorPage() {
  const { user, tenant } = await requireActiveTenant(["instructor"]);

  return (
    <main className="min-h-screen bg-background p-8">
      <header className="mb-8 flex items-center justify-between">
        <NxtdriveLogo className="text-lg" />
        <div className="text-sm text-muted-foreground">
          {user.profile?.full_name ?? user.email} ·{" "}
          <span className="text-foreground">{tenant.name}</span>
        </div>
      </header>
      <h1 className="mb-2 text-2xl font-semibold text-foreground">
        Instructeur dashboard
      </h1>
      <p className="text-muted-foreground">
        Hier komt je planning en leerlingenoverzicht.
      </p>
    </main>
  );
}
