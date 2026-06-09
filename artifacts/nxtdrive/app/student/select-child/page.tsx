import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { getAccessibleStudents } from "@/lib/students/access";
import { setActiveChildId } from "@/lib/students/active-child";

export const dynamic = "force-dynamic";

async function pickChildAction(formData: FormData): Promise<void> {
  "use server";
  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) return;

  const { user, tenant } = await requireActiveTenant(["student", "parent"]);
  const accessible = await getAccessibleStudents(tenant.id);
  const ok = accessible.some(
    (student) => student.id === studentId && student.user_id !== user.id,
  );
  if (!ok) return;

  await setActiveChildId(studentId);
  redirect("/student");
}

export default async function SelectChildPage() {
  const { user, tenant } = await requireActiveTenant(["student", "parent"]);
  const accessible = await getAccessibleStudents(tenant.id);
  const children = accessible.filter((student) => student.user_id !== user.id);

  if (children.length === 0) {
    return (
      <PWAPage>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Er zijn nog geen leerlingen aan je account gekoppeld. Neem contact op
            met je rijschool.
          </CardContent>
        </Card>
      </PWAPage>
    );
  }

  if (children.length === 1) {
    redirect("/student");
  }

  return (
    <PWAPage contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Gezin"
        title="Kies een leerling"
        description="Je bent gekoppeld aan meerdere leerlingen. Kies wie je nu wilt bekijken; later wisselen kan via je profiel."
        align="left"
      />

      <ul className="space-y-2">
        {children.map((child) => (
          <li key={child.id}>
            <form action={pickChildAction}>
              <input type="hidden" name="studentId" value={child.id} />
              <button
                type="submit"
                className="w-full rounded-[1.5rem] border border-border bg-card/90 px-4 py-4 text-left transition hover:border-primary/30 hover:bg-muted/60"
              >
                <div className="font-medium text-foreground">{child.full_name}</div>
                <div className="text-xs text-muted-foreground">{tenant.name}</div>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </PWAPage>
  );
}
