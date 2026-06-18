import { BookOpen } from "lucide-react";
import { StudentShowcaseCard } from "@/components/student/Showcase";

export const dynamic = "force-dynamic";

export default function StudentTheoryPage() {
  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentShowcaseCard title="Theorie" eyebrow="Release 1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-accent text-brand-primary">
            <BookOpen className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-brand-foreground">
              Binnenkort beschikbaar
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-muted-foreground">
              Theorie wordt in een volgende release gekoppeld aan jouw RIS-voortgang.
              Voor nu blijft deze sectie bewust rustig en leeg.
            </p>
          </div>
        </div>
      </StudentShowcaseCard>
    </div>
  );
}
