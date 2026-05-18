import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentStudent } from "@/lib/students/current";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  displayStatus,
  formatEuros,
  type Invoice,
} from "@/lib/invoices/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function StudentInvoicesPage() {
  const { user, tenant } = await requireActiveTenant(["student"]);
  const student = await getCurrentStudent(user.id, tenant.id);
  if (!student) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Je account is nog niet gekoppeld aan een leerlingdossier.
        </CardContent>
      </Card>
    );
  }

  // RLS filters drafts and other students automatically.
  const supabase = await createServerSupabaseClient();
  const { data: invoicesRaw } = await supabase
    .from("invoices")
    .select("*")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });
  const invoices = (invoicesRaw ?? []) as Invoice[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Mijn facturen</h1>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Nog geen facturen voor jou aangemaakt.
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-2">
          {invoices.map((inv) => {
            const display = displayStatus(inv);
            return (
              <li key={inv.id}>
                <Link
                  href={`/student/facturen/${inv.id}`}
                  className="block rounded-lg border border-border bg-card p-4 transition hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">
                        Factuur #{String(inv.invoice_no).padStart(4, "0")}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {inv.due_date
                          ? `Vervalt ${dateFmt.format(new Date(inv.due_date))}`
                          : `Aangemaakt ${dateFmt.format(new Date(inv.created_at))}`}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={DISPLAY_STATUS_VARIANT[display]}>
                        {DISPLAY_STATUS_LABEL[display]}
                      </Badge>
                      <div className="text-sm font-semibold text-foreground">
                        {formatEuros(inv.total_cents)}
                      </div>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
