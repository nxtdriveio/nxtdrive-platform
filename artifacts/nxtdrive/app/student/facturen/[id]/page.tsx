import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActiveStudent } from "@/lib/students/access";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  displayStatus,
  formatEuros,
  remainingCents,
  type Invoice,
  type InvoiceLine,
} from "@/lib/invoices/types";
import {
  PAYMENT_RECORD_COLUMNS,
  paymentMethodLabel,
  paymentRecordDate,
  type PaymentRecord,
} from "@/lib/invoices/payments";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { payStudentInvoice } from "../payment-actions";
import { PaymentStatusBanner } from "./payment-status-banner";
import { derivePaymentReturnStatus } from "@/lib/invoices/payment-return";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function StudentInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<
    string,
    string | string[] | undefined
  >;
  const payError = typeof sp.pay_error === "string" ? sp.pay_error : null;
  const justPaid = sp.paid === "1";
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
  const remaining = remainingCents(invoice);

  // Post-Mollie return feedback. Mollie redirects back with `?paid=1` whatever
  // the outcome, and the confirming webhook can land a moment later — so derive
  // a clear status: settled, still-processing, or failed/cancelled.
  const paymentReturnStatus = derivePaymentReturnStatus({
    justPaid,
    kind: invoice.kind,
    status: invoice.status,
    mollieStatus: invoice.mollie_status ?? null,
    remainingCents: remaining,
  });
  const paymentProcessing = paymentReturnStatus === "pending";

  const isPayable = invoice.status === "open" && invoice.kind === "invoice";

  // Payment history. payment_records is staff-only by RLS, so we read it with
  // the service-role client — safe because we've already verified above that
  // this invoice belongs to the active student (eq("student_id", student.id)).
  const payments =
    invoice.kind === "invoice"
      ? await (async () => {
          const { data } = await createServiceRoleClient()
            .from("payment_records")
            .select(PAYMENT_RECORD_COLUMNS)
            .eq("invoice_id", invoice.id)
            .eq("tenant_id", tenant.id);
          return ((data ?? []) as PaymentRecord[]).sort(
            (a, b) =>
              new Date(paymentRecordDate(a)).getTime() -
              new Date(paymentRecordDate(b)).getTime(),
          );
        })()
      : [];

  // Mollie can be paid online only when the tenant has configured an API key.
  const mollieStatus = isPayable
    ? await getMollieApiKeyStatus(createServiceRoleClient(), tenant.id)
    : { configured: false };
  const canPayOnline =
    isPayable && remaining > 0 && mollieStatus.configured && !paymentProcessing;

  const payErrorLabels: Record<string, string> = {
    no_api_key: "Online betalen is nog niet beschikbaar voor deze rijschool.",
    already_paid: "Deze factuur is al volledig betaald.",
    not_open: "Deze factuur staat niet open.",
    not_invoice: "Deze factuur kan niet online betaald worden.",
    no_checkout: "Kon de betaalpagina niet openen. Probeer het later opnieuw.",
  };
  const payErrorMsg = payError
    ? payErrorLabels[payError] ??
      "Er ging iets mis bij het starten van de betaling."
    : null;

  return (
    <PWAPage contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Betalingen"
        title={`Factuur #${String(invoice.invoice_no).padStart(4, "0")}`}
        description={[
          invoice.issued_at
            ? `Verstuurd ${dateFmt.format(new Date(invoice.issued_at))}`
            : "Nog niet verstuurd",
          invoice.due_date
            ? `Vervalt ${dateFmt.format(new Date(invoice.due_date))}`
            : null,
        ]
          .filter(Boolean)
          .join(" - ")}
        align="left"
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={DISPLAY_STATUS_VARIANT[display]}>
              {DISPLAY_STATUS_LABEL[display]}
            </Badge>
            <Link
              href="/student/betalingen"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Terug naar betalingen
            </Link>
          </div>
        }
      />

      {paymentReturnStatus ? (
        <PaymentStatusBanner status={paymentReturnStatus} />
      ) : null}

      {payErrorMsg ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {payErrorMsg}
        </p>
      ) : null}

      {isPayable && invoice.amount_paid_cents > 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Al betaald</span>
              <span className="font-medium text-foreground">
                {formatEuros(invoice.amount_paid_cents)} van{" "}
                {formatEuros(invoice.total_cents)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (invoice.amount_paid_cents /
                        Math.max(invoice.total_cents, 1)) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Nog te betalen</span>
              <span className="font-semibold text-foreground">
                {formatEuros(remaining)}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {payments.length > 0 ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h2 className="text-sm font-semibold text-foreground">
              Jouw betalingen
            </h2>
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">
                      {formatEuros(p.amount_cents)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {dtFmt.format(new Date(paymentRecordDate(p)))} -{" "}
                      {paymentMethodLabel(p, { plain: true })}
                    </span>
                  </span>
                  <Badge variant="success">Voldaan</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {canPayOnline ? (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm text-foreground">
              Je kunt deze factuur direct online betalen via Mollie.
            </p>
            <form action={payStudentInvoice}>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <Button type="submit" size="lg" className="h-11 w-full">
                Betaal online {formatEuros(remaining)}
              </Button>
            </form>
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
    </PWAPage>
  );
}
