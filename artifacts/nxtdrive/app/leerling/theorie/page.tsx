import { BookOpen, CheckCircle2 } from "lucide-react";
import {
  StudentPageHeader,
  StudentTheoryList,
  StudentTheoryProgressCard,
} from "@/components/student/StudentPwa";
import {
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  loadStudentTheoryHomework,
  loadTheoryModules,
} from "@/lib/theory/data";

export const dynamic = "force-dynamic";

export default async function StudentTheoryPage() {
  const { tenant, student, experience } = await getStudentPwaContext();
  const supabase = await createServerSupabaseClient();
  const [modules, homework] = await Promise.all([
    loadTheoryModules(supabase, tenant.id, { activeOnly: true }),
    student
      ? loadStudentTheoryHomework(supabase, tenant.id, student.id)
      : Promise.resolve([]),
  ]);
  const completed = homework.filter((item) => item.status === "done").length;
  const homeworkProgress =
    homework.length > 0 ? Math.round((completed / homework.length) * 100) : 0;
  const theoryPassed = experience.theory.progress === 100;
  const progress = theoryPassed ? 100 : homeworkProgress;

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Theorie"
        title="Theorie en huiswerk"
        subtitle="Bekijk wat je instructeur heeft klaargezet en welke theorievoorwaarde bij je dossier is geregistreerd."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <StudentTheoryProgressCard
          theory={{
            progress,
            statusCopy: theoryPassed
              ? "Je theorie staat als behaald geregistreerd."
              : homework.length > 0
                ? `${completed} van ${homework.length} theorieopdrachten afgerond.`
                : "Er is nog geen theoriehuiswerk toegewezen. Je instructeur kan dit vanuit de leskaart klaarzetten.",
            homework: [],
            tests: [],
          }}
        />

        <StudentShowcaseCard
          title="Theorievoorwaarde"
          eyebrow="Dossierstatus"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
              {theoryPassed ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              ) : (
                <BookOpen className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div>
              <p className="font-black text-brand-foreground">
                {theoryPassed
                  ? "Theorie behaald"
                  : "Theorie nog niet als behaald geregistreerd"}
              </p>
              <p className="mt-1 text-sm leading-6 text-brand-muted-foreground">
                Deze status is een aparte examenvoorwaarde en wordt niet afgeleid
                uit je RIS-stappen of praktijkgemiddelde.
              </p>
            </div>
          </div>
        </StudentShowcaseCard>
      </div>

      {homework.length > 0 ? (
        <StudentTheoryList
          title="Mijn theoriehuiswerk"
          items={homework.map((item) => ({
            id: item.id,
            title: item.moduleTitle,
            meta: [
              item.deadline ? `Deadline ${item.deadline}` : null,
              item.note,
            ]
              .filter(Boolean)
              .join(" · "),
            status:
              item.status === "done"
                ? "done"
                : item.status === "open"
                  ? "active"
                  : "available",
          }))}
        />
      ) : (
        <StudentShowcaseEmptyState
          title="Nog geen theoriehuiswerk"
          description="Zodra je instructeur een opdracht koppelt, verschijnt die hier."
        />
      )}

      <StudentShowcaseCard title="Beschikbare modules" eyebrow="Rijschoolcatalogus">
        {modules.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((module) => (
              <article
                key={module.id}
                className="rounded-2xl border border-brand-border bg-white/75 p-4"
              >
                <div className="text-xs font-semibold uppercase text-brand-primary">
                  {module.code || "Theorie"}
                </div>
                <h2 className="mt-1 font-black text-brand-foreground">
                  {module.title}
                </h2>
                {module.description ? (
                  <p className="mt-2 text-sm leading-6 text-brand-muted-foreground">
                    {module.description}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <StudentShowcaseEmptyState
            title="Catalogus wordt ingericht"
            description="De rijschool heeft nog geen actieve theoriemodules gepubliceerd."
          />
        )}
      </StudentShowcaseCard>
    </div>
  );
}
