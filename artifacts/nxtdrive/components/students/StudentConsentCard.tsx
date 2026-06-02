import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setStudentReviewConsent } from "@/app/backoffice/leerlingen/actions";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Tenant-scoped consent to use the student for reviews / social media.
 * Privacy by default: no consent. Editable by tenant admins only (the page
 * gates rendering on `isAdmin`); the write goes through the guarded
 * `setStudentReviewConsent` server action (audited).
 */
export function StudentConsentCard({
  studentId,
  consent,
  consentAt,
}: {
  studentId: string;
  consent: boolean;
  consentAt: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review- &amp; social media-toestemming</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Huidige status</span>
          <Badge variant={consent ? "success" : "default"}>
            {consent ? "Toestemming gegeven" : "Geen toestemming"}
          </Badge>
        </div>
        {consentAt ? (
          <p className="text-xs text-muted-foreground">
            Laatst gewijzigd {dtFmt.format(new Date(consentAt))}
          </p>
        ) : null}
        <form action={setStudentReviewConsent}>
          <input type="hidden" name="student_id" value={studentId} />
          <input
            type="hidden"
            name="consent"
            value={consent ? "false" : "true"}
          />
          <Button
            type="submit"
            size="sm"
            variant={consent ? "outline" : "primary"}
            className="w-full"
          >
            {consent ? "Toestemming intrekken" : "Toestemming registreren"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Leg vast of deze leerling akkoord is met gebruik voor reviews of social
          media. Standaard staat dit uit.
        </p>
      </CardContent>
    </Card>
  );
}
