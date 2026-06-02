import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateStudentNotes } from "@/app/backoffice/leerlingen/actions";

/**
 * Editable internal notes on a student. Visible to admin + instructor; the
 * write goes through the guarded `updateStudentNotes` server action (audited).
 */
export function StudentNotesCard({
  studentId,
  notes,
}: {
  studentId: string;
  notes: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notities</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={updateStudentNotes} className="space-y-3">
          <input type="hidden" name="student_id" value={studentId} />
          <Textarea
            name="notes"
            defaultValue={notes ?? ""}
            maxLength={4000}
            rows={5}
            placeholder="Interne notities over deze leerling…"
          />
          <Button type="submit" size="sm" className="w-full">
            Notities opslaan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
