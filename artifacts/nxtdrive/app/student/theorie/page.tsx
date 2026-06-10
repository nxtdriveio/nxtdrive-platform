import { redirect } from "next/navigation";
import { BookOpen, BrainCircuit, CheckCircle2, NotebookPen } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PWAPage, PWAPageHeader, PWAEmptyState } from "@/components/pwa/primitives";
import { StudentTheoryHomeworkCard } from "@/components/student/TheoryHomeworkCard";
import { getActiveStudent } from "@/lib/students/access";
import {
  loadStudentTheoryHomework,
  loadTheoryModules,
} from "@/lib/theory/data";
import {
  THEORY_HOMEWORK_STATUS_LABEL,
  THEORY_HOMEWORK_STATUS_VARIANT,
} from "@/lib/theory/types";
import {
  StudentChecklist,
  StudentListRow,
  StudentProgressBar,
  StudentRing,
  StudentShowcaseCard,
  StudentShowcaseTabs,
} from "@/components/student/Showcase";
import { createNlDateTimeFormatter } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type TheoryTab = "overzicht" | "leren" | "huiswerk" | "toetsen";

const dateFmt = createNlDateTimeFormatter({
  day: "2-digit",
  month: "short",
});

function theoryTabFrom(value: string | undefined): TheoryTab {
  if (value === "leren" || value === "huiswerk" || value === "toetsen") return value;
  return "overzicht";
}

export default async function StudentTheoriePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const activeTab = theoryTabFrom(
    typeof params.tab === "string" ? params.tab : undefined,
  );

  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <Card>
        <CardContent className="pt-6">
          <PWAEmptyState message="Je account is nog niet gekoppeld aan een leerlingdossier." />
        </CardContent>
      </Card>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [homework, modules] = await Promise.all([
    loadStudentTheoryHomework(supabase, tenant.id, student.id),
    loadTheoryModules(supabase, tenant.id, { activeOnly: true }),
  ]);

  const visibleHomework = homework.filter((item) => item.status !== "cancelled");
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const latestHomeworkByModule = new Map<string, (typeof visibleHomework)[number]>();
  for (const item of visibleHomework) {
    if (!latestHomeworkByModule.has(item.theory_module_id)) {
      latestHomeworkByModule.set(item.theory_module_id, item);
    }
  }

  const completedModules = modules.filter((module) => {
    const latest = latestHomeworkByModule.get(module.id);
    return latest?.status === "done";
  }).length;
  const openModules = modules.filter((module) => {
    const latest = latestHomeworkByModule.get(module.id);
    return latest?.status === "open";
  }).length;
  const theoryPct =
    modules.length > 0 ? Math.round((completedModules / modules.length) * 100) : 0;

  const tabs = [
    {
      key: "overzicht",
      label: "Overzicht",
      href: "/student/theorie?tab=overzicht",
    },
    {
      key: "leren",
      label: "Leren",
      href: "/student/theorie?tab=leren",
      count: modules.length,
    },
    {
      key: "huiswerk",
      label: "Huiswerk",
      href: "/student/theorie?tab=huiswerk",
      count: visibleHomework.length,
    },
    {
      key: "toetsen",
      label: "Toetsen",
      href: "/student/theorie?tab=toetsen",
    },
  ] satisfies Array<{ key: TheoryTab; label: string; href: string; count?: number }>;

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Theorie"
        title="Theorie"
        subtitle="Leer, oefen en houd je theorievoortgang overzichtelijk in dezelfde app-flow als je rijlessen."
        icon={<BookOpen className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseTabs items={tabs} activeKey={activeTab} />

      {activeTab === "overzicht" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Theorie voortgang"
            eyebrow="Jouw theorie-overzicht"
            info="Gebaseerd op actieve modules en huiswerk dat door je rijschool aan je leerlingdossier is gekoppeld."
          >
            <div className="grid grid-cols-[6.8rem_minmax(0,1fr)] gap-4">
              <StudentRing value={theoryPct} label="Voortgang" />
              <div className="space-y-3">
                <div className="text-lg font-semibold text-white">
                  {theoryPct >= 70
                    ? "Je theoriebasis staat stevig"
                    : theoryPct >= 35
                      ? "Je bouwt goed op"
                      : "Een sterke start is gezet"}
                </div>
                <StudentProgressBar
                  label="Afgeronde modules"
                  value={modules.length > 0 ? (completedModules / modules.length) * 100 : 0}
                  rightLabel={`${completedModules}/${modules.length || 0}`}
                />
                <StudentProgressBar
                  label="Open huiswerk"
                  value={modules.length > 0 ? (openModules / modules.length) * 100 : 0}
                  rightLabel={`${openModules}`}
                />
                <StudentChecklist
                  items={[
                    {
                      label: "Actieve theoriemodules",
                      checked: modules.length > 0,
                      detail: `${modules.length} beschikbaar`,
                    },
                    {
                      label: "Afgerond huiswerk",
                      checked: completedModules > 0,
                      detail: `${completedModules} modules afgerond`,
                    },
                    {
                      label: "Volgende focus",
                      checked: openModules === 0,
                      detail:
                        openModules > 0
                          ? "Werk eerst je open opdrachten weg"
                          : "Klaar voor extra oefensets",
                    },
                  ]}
                />
              </div>
            </div>
          </StudentShowcaseCard>

          <StudentShowcaseCard
            title="Belangrijkste thema's"
            eyebrow="Hoofdstukken"
            info="De meest actuele modules voor je theoriepad."
          >
            {modules.length === 0 ? (
              <PWAEmptyState message="Je rijschool heeft nog geen theoriemodules voor je geactiveerd." />
            ) : (
              <div className="space-y-2">
                {modules.slice(0, 4).map((module) => {
                  const latest = latestHomeworkByModule.get(module.id);
                  const progress =
                    latest?.status === "done" ? 100 : latest?.status === "open" ? 58 : 18;
                  return (
                    <div
                      key={module.id}
                      className="rounded-[1.15rem] border border-white/10 bg-white/[0.02] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {module.title}
                          </div>
                          <div className="mt-1 text-xs text-white/46">
                            {module.description ?? "Beschikbaar in je theorietraject"}
                          </div>
                        </div>
                        <Badge
                          variant={
                            latest
                              ? THEORY_HOMEWORK_STATUS_VARIANT[latest.status]
                              : "outline"
                          }
                        >
                          {latest ? THEORY_HOMEWORK_STATUS_LABEL[latest.status] : "Nieuw"}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <StudentProgressBar
                          label="Modulevoortgang"
                          value={progress}
                          rightLabel={`${progress}%`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </StudentShowcaseCard>
        </div>
      ) : null}

      {activeTab === "leren" ? (
        <StudentShowcaseCard
          title="Theorie leren"
          eyebrow="Modules"
          info="Hier zie je welke onderwerpen klaarstaan en waar je nu het best verder kunt gaan."
        >
          {modules.length === 0 ? (
            <PWAEmptyState message="Er zijn nog geen actieve theoriehoofdstukken gekoppeld aan je account." />
          ) : (
            <div className="space-y-2">
              {modules.map((module) => {
                const latest = latestHomeworkByModule.get(module.id);
                const badgeVariant = latest
                  ? THEORY_HOMEWORK_STATUS_VARIANT[latest.status]
                  : "outline";
                const badgeLabel = latest
                  ? THEORY_HOMEWORK_STATUS_LABEL[latest.status]
                  : "Nog starten";
                return (
                  <StudentListRow
                    key={module.id}
                    title={module.title}
                    subtitle={module.description ?? "Open theoriehoofdstuk"}
                    meta={module.code ?? "Module"}
                    badge={badgeLabel}
                    badgeVariant={badgeVariant}
                    leading={
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/14 text-primary">
                        <BookOpen className="h-5 w-5" aria-hidden />
                      </span>
                    }
                  />
                );
              })}
            </div>
          )}
        </StudentShowcaseCard>
      ) : null}

      {activeTab === "huiswerk" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Open huiswerk"
            eyebrow="Taken uit je rijschool"
            info="Voltooi opdrachten zodra je ze hebt afgerond, zodat jij en je rijschool dezelfde theorie-stand zien."
            bodyClassName="space-y-4"
          >
            {visibleHomework.length > 0 ? (
              <div className="rounded-[1.15rem] border border-primary/14 bg-primary/10 px-3.5 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <NotebookPen className="h-4 w-4 text-primary" aria-hidden />
                  Eerstvolgende deadline
                </div>
                <p className="mt-1 text-sm text-white/62">
                  {visibleHomework.find((item) => item.deadline)?.moduleTitle ?? "Nog geen deadline ingesteld"}
                  {visibleHomework.find((item) => item.deadline)?.deadline
                    ? ` · ${dateFmt.format(new Date(visibleHomework.find((item) => item.deadline)!.deadline!))}`
                    : ""}
                </p>
              </div>
            ) : null}
            <StudentTheoryHomeworkCard homework={homework} emptyHint />
          </StudentShowcaseCard>
        </div>
      ) : null}

      {activeTab === "toetsen" ? (
        <div className="space-y-4">
          <StudentShowcaseCard
            title="Oefentoetsen"
            eyebrow="Voorbereiden"
            info="Zodra jouw rijschool oefentoetsen of proefexamens aan je koppelt, verschijnen ze hier in dezelfde theorie-flow."
          >
            <div className="space-y-3">
              <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.02] px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BrainCircuit className="h-4 w-4 text-primary" aria-hidden />
                  Proefexamen
                </div>
                <p className="mt-1 text-sm leading-6 text-white/58">
                  Nog geen proefexamens gekoppeld. Werk eerst je theoriehoofdstukken en huiswerk bij.
                </p>
              </div>
              <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.02] px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden />
                  Klaar voor de volgende stap
                </div>
                <p className="mt-1 text-sm leading-6 text-white/58">
                  Houd vooral de modules zonder afgerond huiswerk in de gaten; die leveren nu de meeste winst op.
                </p>
              </div>
            </div>
          </StudentShowcaseCard>

          <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/62">
            Oefentoetsen en resultaten blijven hier automatisch netjes gegroepeerd zodra ze beschikbaar zijn.
          </div>
        </div>
      ) : null}
    </PWAPage>
  );
}
