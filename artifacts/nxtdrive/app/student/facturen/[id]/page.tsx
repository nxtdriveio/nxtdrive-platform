import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getActiveStudent } from "@/lib/students/access";
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
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  if (needsChildPicker) redirect("/student/select-child");
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
  const showPayCta =
    invoice.status === "open" &&
    !!invoice.mollie_checkout_url &&
    (invoice.mollie_status === "open" ||
      invoice.mollie_status === "pending" ||
      invoice.mollie_status === null);

  return (
    <div className="space-y-4">
      <Link
        href="/student/betalingen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar betalingen
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

      {showPayCta && invoice.mollie_checkout_url ? (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm text-foreground">
              Je kunt deze factuur direct online betalen via Mollie.
            </p>
            <a
              href={invoice.mollie_checkout_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Betaal nu {formatEuros(invoice.total_cents)}
            </a>
            <p className="text-xs text-muted-foreground">
              Je wordt doorgestuurd naar Mollie en daarna teruggebracht naar
              deze pagina.
            </p>
          </CardContent>
        </Card>
      ) : null}

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
