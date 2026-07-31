import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  StudentInitialBadge,
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";
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
  redirect("/leerling");
}

export default async function SelectChildPage() {
  const { user, tenant } = await requireActiveTenant(["student", "parent"]);
  const accessible = await getAccessibleStudents(tenant.id);
  const children = accessible.filter((student) => student.user_id !== user.id);

  if (children.length === 0) {
    return (
      <PWAPage app="student">
        <StudentShowcaseCard title="Nog geen leerling gekoppeld" eyebrow="Gezin">
          <StudentShowcaseEmptyState
            title="Er zijn nog geen leerlingen aan je account gekoppeld."
            description="Neem contact op met je rijschool om je gezinssituatie te laten koppelen."
            icon={<Users className="h-5 w-5" aria-hidden />}
          />
        </StudentShowcaseCard>
      </PWAPage>
    );
  }

  if (children.length === 1) {
    redirect("/leerling");
  }

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Gezin"
        title="Kies een leerling"
        subtitle="Je bent gekoppeld aan meerdere leerlingen. Kies wie je nu wilt bekijken."
        icon={<Users className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseCard
        title="Beschikbare leerlingprofielen"
        eyebrow="Selecteer"
        info="Je kunt later altijd weer wisselen via de profielpagina."
      >
        <ul className="space-y-2">
          {children.map((child) => (
            <li key={child.id}>
              <form action={pickChildAction}>
                <input type="hidden" name="studentId" value={child.id} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-primary/40 hover:bg-white/[0.05]"
                >
                  <StudentInitialBadge
                    label={child.full_name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {child.full_name}
                    </div>
                    <div className="text-xs text-white/46">{tenant.name}</div>
                  </div>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </StudentShowcaseCard>
    </PWAPage>
  );
}
