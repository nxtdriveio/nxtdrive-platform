import { Car, ListChecks, MapPin } from "lucide-react";
import { StudentShowcaseCard } from "@/components/student/Showcase";

export function StudentLessonContextCard({
  vehicleLabel,
  locationName,
  topics,
}: {
  vehicleLabel: string | null;
  locationName: string | null;
  topics: string[];
}) {
  const hasAny = vehicleLabel || locationName || topics.length > 0;
  if (!hasAny) return null;

  return (
    <StudentShowcaseCard
      title="Lescontext"
      eyebrow="Omgeving"
      info="Hier zie je met welk voertuig, op welke locatie en met welke onderdelen deze les was opgebouwd."
    >
      <div className="space-y-3">
        {vehicleLabel || locationName ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {vehicleLabel ? (
              <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-3 py-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                  <Car className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Voertuig
                </div>
                <div className="mt-2 text-sm text-white">{vehicleLabel}</div>
              </div>
            ) : null}
            {locationName ? (
              <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-3 py-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
                  <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Locatie
                </div>
                <div className="mt-2 text-sm text-white">{locationName}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {topics.length > 0 ? (
          <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-3 py-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
              <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden />
              Behandelde onderdelen
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/74"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </StudentShowcaseCard>
  );
}
