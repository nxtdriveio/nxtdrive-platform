import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import { getAccessibleStudents } from "@/lib/students/access";
import { setActiveChildId } from "@/lib/students/active-child";

export const dynamic = "force-dynamic";

async function pickChildAction(formData: FormData): Promise<void> {
  "use server";
  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) return;
  // Re-verify the user can access this student before trusting the form.
  const { user, tenant } = await requireActiveTenant(["parent"]);
  const accessible = await getAccessibleStudents(tenant.id);
  const ok = accessible.some(
    (s) => s.id === studentId && s.user_id !== user.id,
  );
  if (!ok) return;
  await setActiveChildId(studentId);
  redirect("/ouder");
}

export default async function OuderSelectChildPage() {
  const { user, tenant } = await requireActiveTenant(["parent"]);
  const accessible = await getAccessibleStudents(tenant.id);
  const children = accessible.filter((s) => s.user_id !== user.id);

  if (children.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Er zijn nog geen leerlingen aan je account gekoppeld. Neem contact op
          met de rijschool.
        </CardContent>
      </Card>
    );
  }

  if (children.length === 1) {
    redirect("/ouder");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Kies een leerling
        </h1>
        <p className="text-sm text-muted-foreground">
          Je bent gekoppeld aan meerdere leerlingen. Kies wie je nu wilt
          bekijken — je kunt later wisselen.
        </p>
      </div>

      <ul className="space-y-2">
        {children.map((c) => (
          <li key={c.id}>
            <form action={pickChildAction}>
              <input type="hidden" name="studentId" value={c.id} />
              <button
                type="submit"
                className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:bg-muted/60"
              >
                <div className="font-medium text-foreground">{c.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {tenant.name}
                </div>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
