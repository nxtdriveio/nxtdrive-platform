import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
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
  type InvoiceLine,
} from "@/lib/invoices/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function StudentInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, tenant } = await requireActiveTenant(["student"]);
  const student = await getCurrentStudent(user.id, tenant.id);
  if (!student) notFound();

  const supabase = await createServerSupabaseClient();
  const [invoiceRes, linesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", id)
      .order("position", { ascending: true }),
  ]);
  if (!invoiceRes.data) notFound();
  const invoice = invoiceRes.data as Invoice;
  const lines = (linesRes.data ?? []) as InvoiceLine[];
  const display = displayStatus(invoice);

  return (
    <div className="space-y-4">
      <Link
        href="/student/facturen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar facturen
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Factuur #{String(invoice.invoice_no).padStart(4, "0")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {invoice.issued_at
            ? `Verstuurd ${dateFmt.format(new Date(invoice.issued_at))}`
            : "Nog niet verstuurd"}
          {invoice.due_date
            ? ` · Vervalt ${dateFmt.format(new Date(invoice.due_date))}`
            : ""}
        </p>
        <div className="mt-2">
          <Badge variant={DISPLAY_STATUS_VARIANT[display]}>
            {DISPLAY_STATUS_LABEL[display]}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen regels.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Omschrijving</th>
                  <th className="py-2 font-medium text-right">Aantal</th>
                  <th className="py-2 font-medium text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-foreground">{l.description}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {Number(l.quantity)}
                    </td>
                    <td className="py-2 text-right font-medium text-foreground">
                      {formatEuros(l.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border">
                <tr>
                  <td colSpan={2} className="py-2 text-right text-muted-foreground">
                    Subtotaal
                  </td>
                  <td className="py-2 text-right">
                    {formatEuros(invoice.subtotal_cents)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-2 text-right text-muted-foreground">
                    BTW
                  </td>
                  <td className="py-2 text-right">
                    {formatEuros(invoice.tax_cents)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={2}
                    className="py-2 text-right font-semibold text-foreground"
                  >
                    Totaal
                  </td>
                  <td className="py-2 text-right font-semibold text-foreground">
                    {formatEuros(invoice.total_cents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
