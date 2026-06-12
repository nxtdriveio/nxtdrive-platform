import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
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
import {
  StudentInitialBadge,
  StudentListRow,
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
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
        <StudentShowcaseNotice
          tone="danger"
          title="Betalen lukt nu niet"
          description={payErrorMsg}
        />
      ) : null}

      <StudentShowcaseCard
        title="Factuuroverzicht"
        eyebrow="Bedragen"
        info="Hier zie je de belangrijkste bedragen van deze factuur in een oogopslag."
      >
        <div className="grid grid-cols-2 gap-2">
          <AmountTile label="Subtotaal" value={formatEuros(invoice.subtotal_cents)} />
          <AmountTile label="BTW" value={formatEuros(invoice.tax_cents)} />
          <AmountTile label="Totaal" value={formatEuros(invoice.total_cents)} />
          <AmountTile
            label={remaining > 0 ? "Nog open" : "Openstaand"}
            value={formatEuros(remaining)}
          />
        </div>
      </StudentShowcaseCard>

      {isPayable && invoice.amount_paid_cents > 0 ? (
        <StudentShowcaseCard title="Betaalstatus" eyebrow="Voortgang">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Al betaald</span>
              <span className="font-medium text-white">
                {formatEuros(invoice.amount_paid_cents)} van{" "}
                {formatEuros(invoice.total_cents)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, color-mix(in oklab, var(--primary) 76%, white), var(--primary))",
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
              <span className="text-white/50">Nog te betalen</span>
              <span className="font-semibold text-white">
                {formatEuros(remaining)}
              </span>
            </div>
          </div>
        </StudentShowcaseCard>
      ) : null}

      {payments.length > 0 ? (
        <StudentShowcaseCard title="Jouw betalingen" eyebrow="Historie">
          <div className="space-y-2">
            {payments.map((payment) => (
              <StudentListRow
                key={payment.id}
                title={formatEuros(payment.amount_cents)}
                subtitle={`${dtFmt.format(new Date(paymentRecordDate(payment)))} · ${paymentMethodLabel(payment, { plain: true })}`}
                badge="Voldaan"
                badgeVariant="success"
                leading={<StudentInitialBadge label="€" tone="green" />}
              />
            ))}
          </div>
        </StudentShowcaseCard>
      ) : null}

      {canPayOnline ? (
        <StudentShowcaseCard
          title="Online betalen"
          eyebrow="Mollie"
          info="Je wordt doorgestuurd naar Mollie en daarna teruggebracht naar deze factuur."
        >
          <div className="space-y-2">
            <p className="text-sm text-white/64">
              Je kunt deze factuur direct online betalen via Mollie.
            </p>
            <form action={payStudentInvoice}>
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <Button type="submit" size="lg" className="h-11 w-full">
                Betaal online {formatEuros(remaining)}
              </Button>
            </form>
          </div>
        </StudentShowcaseCard>
      ) : null}

      <StudentShowcaseCard title="Factuurregels" eyebrow="Specificatie">
        <div>
          {lines.length === 0 ? (
            <StudentShowcaseEmptyState
              title="Geen regels"
              description="Deze factuur bevat nog geen losse regels."
            />
          ) : (
            <table className="w-full text-sm text-white/72">
              <thead className="text-left text-white/42">
                <tr>
                  <th className="py-2 font-medium">Omschrijving</th>
                  <th className="py-2 font-medium text-right">Aantal</th>
                  <th className="py-2 font-medium text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-white">{l.description}</td>
                    <td className="py-2 text-right text-white/48">
                      {Number(l.quantity)}
                    </td>
                    <td className="py-2 text-right font-medium text-white">
                      {formatEuros(l.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10">
                <tr>
                  <td colSpan={2} className="py-2 text-right text-white/46">
                    Subtotaal
                  </td>
                  <td className="py-2 text-right text-white">
                    {formatEuros(invoice.subtotal_cents)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-2 text-right text-white/46">
                    BTW
                  </td>
                  <td className="py-2 text-right text-white">
                    {formatEuros(invoice.tax_cents)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={2}
                    className="py-2 text-right font-semibold text-white"
                  >
                    Totaal
                  </td>
                  <td className="py-2 text-right font-semibold text-white">
                    {formatEuros(invoice.total_cents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </StudentShowcaseCard>
    </PWAPage>
  );
}

function AmountTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
    </div>
  );
}
