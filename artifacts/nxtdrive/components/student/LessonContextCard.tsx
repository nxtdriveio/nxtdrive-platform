import { Car, MapPin, ListChecks, MessageSquare, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StudentLessonContextCard({
  vehicleLabel,
  locationName,
  studentNote,
  attentionPoints,
  topics,
}: {
  vehicleLabel: string | null;
  locationName: string | null;
  studentNote: string | null;
  attentionPoints: string | null;
  topics: string[];
}) {
  const hasAny =
    vehicleLabel ||
    locationName ||
    studentNote ||
    attentionPoints ||
    topics.length > 0;
  if (!hasAny) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Lescontext
        </div>

        {vehicleLabel || locationName ? (
          <div className="flex flex-wrap gap-4 text-sm">
            {vehicleLabel ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Car className="h-4 w-4 text-muted-foreground" aria-hidden />
                {vehicleLabel}
              </span>
            ) : null}
            {locationName ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                {locationName}
              </span>
            ) : null}
          </div>
        ) : null}

        {topics.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ListChecks className="h-4 w-4" aria-hidden /> Behandelde onderdelen
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {studentNote ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquare className="h-4 w-4" aria-hidden /> Notitie van je instructeur
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {studentNote}
            </p>
          </div>
        ) : null}

        {attentionPoints ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Aandachtspunten
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {attentionPoints}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
