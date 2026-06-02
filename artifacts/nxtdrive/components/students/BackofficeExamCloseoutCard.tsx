import Link from "next/link";
import { PartyPopper, FileText, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { finishStudentTraject } from "@/app/backoffice/leerlingen/actions";

/**
 * Examenflow C — backoffice afronding na een geslaagd examen. Toont de open-
 * factuurcheck en de actie om het traject af te ronden (leerling op inactief).
 * Alleen admins; de actie loopt via de geguarde RPC.
 */
export function BackofficeExamCloseoutCard({
  studentId,
  openInvoiceCount,
  studentActive,
}: {
  studentId: string;
  openInvoiceCount: number;
  studentActive: boolean;
}) {
  return (
    <Card className="border-success/40 bg-success/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-4 w-4 text-success" aria-hidden />
          Geslaagd — afronden
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          De leerling is geslaagd. Controleer de facturen en rond daarna het
          traject af.
        </p>

        <div className="flex items-center justify-between rounded-md border border-border bg-card/60 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
            Openstaande facturen
          </span>
          <Badge variant={openInvoiceCount > 0 ? "warning" : "success"}>
            {openInvoiceCount}
          </Badge>
        </div>

        {openInvoiceCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Er staan nog facturen open. Handel deze bij voorkeur eerst af.
          </p>
        ) : null}

        {studentActive ? (
          <form action={finishStudentTraject}>
            <input type="hidden" name="student_id" value={studentId} />
            <Button type="submit" size="sm" className="w-full">
              Traject afronden
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        ) : (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Traject is afgerond — leerling staat op inactief.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
