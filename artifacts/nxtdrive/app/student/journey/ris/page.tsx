import Link from "next/link";
import { MessageCircle, Route } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentEmptyState,
  StudentModuleProgressList,
  StudentPageHeader,
  StudentReflectionForm,
  StudentRISReflectionCard,
  StudentSection,
} from "@/components/student/StudentPwa";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function StudentRisPage() {
  const { experience } = await getStudentPwaContext();

  if (!experience.ris.active) {
    return (
      <div className="space-y-4">
        <StudentPageHeader
          eyebrow="RIS leskaart"
          title="RIS is nog niet actief"
          subtitle="Je kunt wel je algemene voortgang bekijken."
        />
        <StudentEmptyState
          title="RIS is nog niet actief voor jouw opleiding."
          message="Zodra je rijschool RIS publiceert, zie je hier alleen de onderdelen die voor jou bedoeld zijn."
        />
        <Link href="/leerling/reflectie" className={buttonVariants()}>
          Bekijk algemene voortgang
        </Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="RIS leskaart"
        title="Gepubliceerde RIS voortgang"
        subtitle="Je ziet hier alleen gepubliceerde lesinformatie en duidelijke focuspunten voor jouw volgende stap."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="space-y-4">
          <StudentSection title="RIS voortgang" icon={Route}>
            <StudentModuleProgressList modules={experience.ris.modules} />
          </StudentSection>

          {experience.ris.reflection ? (
            <StudentRISReflectionCard reflection={experience.ris.reflection} />
          ) : (
            <StudentEmptyState
              title="Nog geen gepubliceerde lesreflectie"
              message="Zodra je instructeur feedback publiceert, verschijnt deze hier."
            />
          )}
        </div>

        <div className="space-y-4">
          <StudentReflectionForm />
          <StudentSection title="Vraag aan je instructeur" icon={MessageCircle}>
            <div className="rounded-[var(--radius-card)] border border-brand-border bg-white/90 p-4 shadow-brand-card">
              <p className="text-sm leading-6 text-brand-muted-foreground">
                Heb je een vraag over je focuspunten? Stuur je instructeur een
                bericht vanuit je leerlingomgeving.
              </p>
              <Link
                href="/leerling/berichten/instructor"
                className={buttonVariants({ size: "sm", className: "mt-3" })}
              >
                Bericht instructeur
              </Link>
            </div>
          </StudentSection>
        </div>
      </div>
    </div>
  );
}
