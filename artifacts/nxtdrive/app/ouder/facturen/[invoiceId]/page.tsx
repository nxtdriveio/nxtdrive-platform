import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  NoChildCard,
  SectionDisabledCard,
} from "@/components/parent-portal/PortalCards";
import { loadPortalContext } from "@/lib/parent-portal/context";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import {
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
import { derivePaymentReturnStatus } from "@/lib/invoices/payment-return";
import { buildInvoicePaymentStatusFlow } from "@/lib/invoices/payment-status-flow";
import { createNlDateTimeFormatter, resolveTenantTimeZone } from "@/lib/datetime";
import { payParentInvoice } from "../payment-actions";
import { ParentPaymentReturnBanner } from "./payment-return-banner";

export const dynamic = "force-dynamic";

function createParentInvoiceFormatters(timeZone: string) {
  return {
    dateFmt: createNlDateTimeFormatter(
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
      timeZone,
    ),
    dateTimeFmt: createNlDateTimeFormatter(
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
      timeZone,
    ),
  };
}

export default async function OuderFactuurDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { invoiceId } = await params;
  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<
    string,
    string | string[] | undefined
  >;
  const justPaid = sp.paid === "1";
  const payError = typeof sp.pay_error === "string" ? sp.pay_error : null;

  const ctx = await loadPortalContext();
  if (!ctx.student) return <NoChildCard />;
  if (!ctx.visibility.facturen) return <SectionDisabledCard title="Facturen" />;

  const { dateFmt, dateTimeFmt } = createParentInvoiceFormatters(
    resolveTenantTimeZone(ctx.tenant),
  );
  const service = createServiceRoleClient();
  const [invoiceRes, linesRes] = await Promise.all([
    service
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("tenant_id", ctx.tenant.id)
      .eq("student_id", ctx.student.id)
      .neq("status", "draft")
      .maybeSingle(),
    service
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", ctx.tenant.id)
      .order("position", { ascending: true }),
  ]);

  if (invoiceRes.error) {
    throw new Error(`Ouderfactuur laden mislukt: ${invoiceRes.error.message}`);
  }
  if (linesRes.error) {
    throw new Error(`Factuurregels laden mislukt: ${linesRes.error.message}`);
  }
  if (!invoiceRes.data) notFound();

  const invoice = invoiceRes.data as Invoice;
  const lines = (linesRes.data ?? []) as InvoiceLine[];
  const outstanding = remainingCents(invoice);
  const paymentReturnStatus = derivePaymentReturnStatus({
    justPaid,
    kind: invoice.kind,
    status: invoice.status,
    mollieStatus: invoice.mollie_status ?? null,
    remainingCents: outstanding,
  });
  const paymentProcessing = paymentReturnStatus === "pending";
  const isPayable =
    invoice.kind === "invoice" && invoice.status === "open" && outstanding > 0;
  const mollieConfigured = isPayable
    ? (await getMollieApiKeyStatus(service, ctx.tenant.id)).configured
    : false;
  const flow = buildInvoicePaymentStatusFlow(invoice, {
    mollieConfigured,
    paymentProcessing,
  });

  const payments =
    invoice.kind === "invoice"
      ? await (async () => {
          const { data, error } = await service
            .from("payment_records")
            .select(PAYMENT_RECORD_COLUMNS)
            .eq("invoice_id", invoice.id)
            .eq("tenant_id", ctx.tenant.id);
          if (error) {
            throw new Error(`Betaalhistorie laden mislukt: ${error.message}`);
          }
          return ((data ?? []) as PaymentRecord[]).sort(
            (a, b) =>
              new Date(paymentRecordDate(a)).getTime() -
              new Date(paymentRecordDate(b)).getTime(),
          );
        })()
      : [];

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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/ouder/facturen"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Terug naar facturen
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">
            Factuur #{invoice.invoice_no}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Voor {ctx.student.full_name}
            {invoice.due_date
              ? ` - vervalt ${dateFmt.format(new Date(invoice.due_date))}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={flow.badgeVariant}>{flow.badgeLabel}</Badge>
          <Link
            href={`/ouder/facturen/${invoice.id}/pdf`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            <Download className="h-4 w-4" aria-hidden />
            PDF
          </Link>
        </div>
      </div>

      {paymentReturnStatus ? (
        <ParentPaymentReturnBanner status={paymentReturnStatus} />
      ) : null}

      {payErrorMsg ? (
        <div className="rounded-xl border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-danger">
          {payErrorMsg}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Betaalstatus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {flow.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {flow.description}
              </p>
              {flow.dueLabel ? (
                <p className="mt-2 text-sm font-medium text-foreground">
                  {flow.dueLabel}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Nog open
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {flow.remainingLabel}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${flow.progressPct}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {formatEuros(flow.paidCents)} betaald van{" "}
                {formatEuros(invoice.total_cents)}
              </div>
            </div>
          </div>

          <ol className="grid gap-2 md:grid-cols-3">
            {flow.timeline.map((item) => (
              <li
                key={item.label}
                className="rounded-xl border border-border bg-background px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {item.label}
                  </span>
                  <Badge
                    variant={
                      item.state === "done"
                        ? "success"
                        : item.state === "active"
                          ? "info"
                          : "outline"
                    }
                  >
                    {item.state === "done"
                      ? "Klaar"
                      : item.state === "active"
                        ? "Nu"
                        : "Open"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              </li>
            ))}
          </ol>

          {flow.canPayOnline ? (
            <form action={payParentInvoice}>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <Button type="submit" size="lg" className="w-full sm:w-auto">
                Betaal online {flow.remainingLabel}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Factuurregels</CardTitle>
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Deze factuur bevat geen losse regels.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">Omschrijving</th>
                      <th className="py-2 text-right font-medium">Aantal</th>
                      <th className="py-2 text-right font-medium">Bedrag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2 text-foreground">
                          {line.description}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {Number(line.quantity)}
                        </td>
                        <td className="py-2 text-right font-medium text-foreground">
                          {formatEuros(line.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border">
                    <tr>
                      <td colSpan={2} className="py-2 text-right text-muted-foreground">
                        Subtotaal
                      </td>
                      <td className="py-2 text-right text-foreground">
                        {formatEuros(invoice.subtotal_cents)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-2 text-right text-muted-foreground">
                        BTW
                      </td>
                      <td className="py-2 text-right text-foreground">
                        {formatEuros(invoice.tax_cents)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-2 text-right font-semibold text-foreground">
                        Totaal
                      </td>
                      <td className="py-2 text-right font-semibold text-foreground">
                        {formatEuros(invoice.total_cents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" aria-hidden />
              Betaalhistorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog geen betaling geregistreerd.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {payments.map((payment) => (
                  <li key={payment.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {formatEuros(payment.amount_cents)}
                      </span>
                      <Badge variant="success">Voldaan</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateTimeFmt.format(new Date(paymentRecordDate(payment)))}{" "}
                      - {paymentMethodLabel(payment, { plain: true })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
