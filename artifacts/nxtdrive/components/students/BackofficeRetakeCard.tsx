import Link from "next/link";
import {
  CalendarPlus,
  HeartHandshake,
  Package as PackageIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/**
 * Deterministic herexamen follow-up. During the pilot this deliberately avoids
 * generated pass probabilities and AI-derived advice.
 */
export function BackofficeRetakeCard({
  lastExamNote,
}: {
  studentId: string;
  lastExamNote: string | null;
}) {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartHandshake
            className="h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          Gezakt — vervolg bepalen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Bespreek de gepubliceerde uitslag en observaties, leg de volgende focus
          vast en plan pas daarna een passend vervolg.
        </p>

        {lastExamNote ? (
          <div className="rounded-md border border-border bg-card/60 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">Vastgelegde vervolgstap: </span>
            {lastExamNote}
          </div>
        ) : (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-foreground">
            Nog geen vervolgstap vastgelegd. Baseer het besluit op recente
            observaties en open veiligheidsaandacht.
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href="/backoffice/agenda"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Vervolg plannen
          </Link>
          <Link
            href="/backoffice/packages"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <PackageIcon className="h-4 w-4" aria-hidden />
            Pakket bekijken
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
