import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTaskLaunchData } from "@/lib/tasks/launch-data";
import { CreateTaskFromEntityButton } from "@/app/backoffice/taken/create-task-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  displayStatus,
  formatEuros,
  installmentLabel,
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
import { formatTegoed, type Student } from "@/lib/students/types";
import {
  INSTALLMENT_CREDIT_MODE_LABEL,
  loadInvoiceInstallmentCredit,
} from "@/lib/invoices/installment-credit";
import {
  addInvoiceLine,
  createCreditNote,
  recordInvoicePayment,
  removeInvoiceLine,
  setInvoiceStatus,
  updateInvoiceDraft,
} from "../actions";
import { createMolliePayment } from "../mollie-actions";

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

export default async function InvoiceDetailPage({
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
  const mollieFlag = typeof sp.mollie === "string" ? sp.mollie : null;
  const mollieError =
    typeof sp.mollie_error === "string" ? sp.mollie_error : null;
  const creditError =
    typeof sp.credit_error === "string" ? sp.credit_error : null;
  const payFlag = typeof sp.pay === "string" ? sp.pay : null;
  const payError = typeof sp.pay_error === "string" ? sp.pay_error : null;
  const { tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin = roles.includes("tenant_admin");

  const supabase = await createServerSupabaseClient();
  const [invoiceRes, linesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", id)
      .eq("tenant_id", tenant.id)
      .order("position", { ascending: true }),
  ]);
  if (!invoiceRes.data) notFound();
  const invoice = invoiceRes.data as Invoice;
  const lines = (linesRes.data ?? []) as InvoiceLine[];

  const taskLaunch = await loadTaskLaunchData(
    createServiceRoleClient(),
    tenant.id,
  );

  const { data: studentRaw } = await supabase
    .from("students")
    .select("id, full_name, email")
    .eq("id", invoice.student_id)
    .maybeSingle();
  const student = studentRaw as
    | (Pick<Student, "id" | "full_name" | "email">)
    | null;

  // Credit-note relationships: an existing credit note for this invoice, or —
  // if this IS a credit note — the original it credits.
  const [existingCreditRes, originalRes] = await Promise.all([
    invoice.kind === "invoice"
      ? supabase
          .from("invoices")
          .select("id, invoice_no")
          .eq("credit_of_invoice_id", invoice.id)
          .eq("tenant_id", tenant.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    invoice.credit_of_invoice_id
      ? supabase
          .from("invoices")
          .select("id, invoice_no")
          .eq("id", invoice.credit_of_invoice_id)
          .eq("tenant_id", tenant.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const existingCredit = existingCreditRes.data as
    | { id: string; invoice_no: number }
    | null;
  const creditOriginal = originalRes.data as
    | { id: string; invoice_no: number }
    | null;

  const installmentCredit = await loadInvoiceInstallmentCredit(
    supabase,
    tenant.id,
    invoice,
  );

  // Payment history — admins + instructors can read payment_records via RLS.
  const { data: paymentsRaw } = await supabase
    .from("payment_records")
    .select(PAYMENT_RECORD_COLUMNS)
    .eq("invoice_id", invoice.id)
    .eq("tenant_id", tenant.id);
  const payments = ((paymentsRaw ?? []) as PaymentRecord[]).sort(
    (a, b) =>
      new Date(paymentRecordDate(a)).getTime() -
      new Date(paymentRecordDate(b)).getTime(),
  );

  const display = displayStatus(invoice);
  const isDraft = invoice.status === "draft";
  const isOpen = invoice.status === "open";
  const isCreditNote = invoice.kind === "credit_note";
  const remaining = remainingCents(invoice);
  const termijn = installmentLabel(invoice);
  const canCredit =
    isAdmin &&
    invoice.kind === "invoice" &&
    (invoice.status === "open" || invoice.status === "paid") &&
    !existingCredit;

  return (
    <div className="space-y-6">
      <Link
        href="/backoffice/facturen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar facturen
      </Link>

      {creditError ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Creditfactuur aanmaken mislukt: {creditError}
        </p>
      ) : null}
      {isCreditNote && creditOriginal ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          Dit is een creditfactuur bij{" "}
          <Link
            href={`/backoffice/facturen/${creditOriginal.id}`}
            className="font-medium underline"
          >
            factuur #{String(creditOriginal.invoice_no).padStart(4, "0")}
          </Link>
          .
        </p>
      ) : null}
      {existingCredit ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          Er is een creditfactuur voor deze factuur:{" "}
          <Link
            href={`/backoffice/facturen/${existingCredit.id}`}
            className="font-medium underline"
          >
            creditfactuur #{String(existingCredit.invoice_no).padStart(4, "0")}
          </Link>
          .
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {isCreditNote ? "Creditfactuur" : "Factuur"} #
              {String(invoice.invoice_no).padStart(4, "0")}
            </h1>
            {termijn ? <Badge variant="info">{termijn}</Badge> : null}
            {isCreditNote ? (
              <Badge variant="warning">Creditfactuur</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {student ? (
              <Link
                href={`/backoffice/leerlingen/${student.id}`}
                className="hover:underline"
              >
                {student.full_name}
              </Link>
            ) : (
              "Onbekende leerling"
            )}{" "}
            · aangemaakt {dtFmt.format(new Date(invoice.created_at))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateTaskFromEntityButton
            entityType="invoice"
            entityId={invoice.id}
            entityLabel={`Factuur #${String(invoice.invoice_no).padStart(4, "0")}`}
            boards={taskLaunch.boards}
            members={taskLaunch.members}
          />
          <Badge variant={DISPLAY_STATUS_VARIANT[display]}>
            {DISPLAY_STATUS_LABEL[display]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Regels</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen regels.{" "}
                  {isDraft && isAdmin
                    ? "Voeg er hieronder één toe."
                    : null}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">Omschrijving</th>
                      <th className="py-2 font-medium">Aantal</th>
                      <th className="py-2 font-medium">Prijs</th>
                      <th className="py-2 font-medium text-right">Bedrag</th>
                      {isDraft && isAdmin ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 text-foreground">
                          {l.description}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {Number(l.quantity)}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {formatEuros(l.unit_price_cents)}
                        </td>
                        <td className="py-2 text-right font-medium text-foreground">
                          {formatEuros(l.amount_cents)}
                        </td>
                        {isDraft && isAdmin ? (
                          <td className="py-2 text-right">
                            <form action={removeInvoiceLine}>
                              <input
                                type="hidden"
                                name="invoice_id"
                                value={invoice.id}
                              />
                              <input
                                type="hidden"
                                name="line_id"
                                value={l.id}
                              />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                aria-label="Regel verwijderen"
                              >
                                <X className="h-4 w-4" aria-hidden />
                              </Button>
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border">
                    <tr>
                      <td colSpan={3} className="py-2 text-right text-muted-foreground">
                        Subtotaal
                      </td>
                      <td className="py-2 text-right">
                        {formatEuros(invoice.subtotal_cents)}
                      </td>
                      {isDraft && isAdmin ? <td /> : null}
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-2 text-right text-muted-foreground">
                        BTW
                      </td>
                      <td className="py-2 text-right">
                        {formatEuros(invoice.tax_cents)}
                      </td>
                      {isDraft && isAdmin ? <td /> : null}
                    </tr>
                    <tr>
                      <td
                        colSpan={3}
                        className="py-2 text-right font-semibold text-foreground"
                      >
                        Totaal
                      </td>
                      <td className="py-2 text-right font-semibold text-foreground">
                        {formatEuros(invoice.total_cents)}
                      </td>
                      {isDraft && isAdmin ? <td /> : null}
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>

          {isDraft && isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Regel toevoegen</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={addInvoiceLine} className="space-y-3">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="description">Omschrijving</Label>
                    <Input
                      id="description"
                      name="description"
                      required
                      maxLength={500}
                      placeholder="bv. Extra lesuur"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="quantity">Aantal</Label>
                      <Input
                        id="quantity"
                        name="quantity"
                        defaultValue="1"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit_price_euros">Prijs per eenheid (€)</Label>
                      <Input
                        id="unit_price_euros"
                        name="unit_price_euros"
                        required
                        placeholder="bv. 65,00"
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm">
                    Regel toevoegen
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <Field
                  label="Verstuurd op"
                  value={
                    invoice.issued_at
                      ? dtFmt.format(new Date(invoice.issued_at))
                      : "—"
                  }
                />
                <Field
                  label="Vervaldatum"
                  value={
                    invoice.due_date
                      ? dateFmt.format(new Date(invoice.due_date))
                      : "—"
                  }
                />
                <Field
                  label="Betaald op"
                  value={
                    invoice.paid_at
                      ? dtFmt.format(new Date(invoice.paid_at))
                      : "—"
                  }
                />
                {!isCreditNote && (invoice.amount_paid_cents > 0 || isOpen) ? (
                  <>
                    <Field
                      label="Betaald"
                      value={`${formatEuros(invoice.amount_paid_cents)} van ${formatEuros(
                        invoice.total_cents,
                      )}`}
                    />
                    <Field
                      label="Resterend"
                      value={
                        remaining > 0 ? (
                          <span className="font-medium">
                            {formatEuros(remaining)}
                          </span>
                        ) : (
                          <Badge variant="success">Volledig betaald</Badge>
                        )
                      }
                    />
                  </>
                ) : null}
                <Field label="Interne notitie" value={invoice.notes ?? "—"} />
              </dl>
            </CardContent>
          </Card>

          {!isCreditNote && payments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Betalingen</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">Datum</th>
                      <th className="py-2 font-medium">Methode</th>
                      <th className="py-2 font-medium text-right">Bedrag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 align-top text-muted-foreground">
                          {dtFmt.format(new Date(paymentRecordDate(p)))}
                        </td>
                        <td className="py-2 align-top text-foreground">
                          {paymentMethodLabel(p)}
                          {p.provider === "mollie" && p.mollie_status ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({p.mollie_status})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right align-top font-medium text-foreground">
                          {formatEuros(p.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border">
                    <tr>
                      <td
                        colSpan={2}
                        className="py-2 text-right text-muted-foreground"
                      >
                        Totaal betaald
                      </td>
                      <td className="py-2 text-right font-semibold text-foreground">
                        {formatEuros(invoice.amount_paid_cents)}
                      </td>
                    </tr>
                    {remaining > 0 ? (
                      <tr>
                        <td
                          colSpan={2}
                          className="py-2 text-right text-muted-foreground"
                        >
                          Resterend
                        </td>
                        <td className="py-2 text-right font-medium text-foreground">
                          {formatEuros(remaining)}
                        </td>
                      </tr>
                    ) : null}
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          ) : null}

          {installmentCredit ? (
            <Card>
              <CardHeader>
                <CardTitle>Termijn-tegoed</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-3 text-sm">
                  <Field
                    label="Vrijgavebeleid"
                    value={INSTALLMENT_CREDIT_MODE_LABEL[installmentCredit.policy]}
                  />
                  <Field
                    label="Pakket-tegoed"
                    value={formatTegoed(installmentCredit.packageMinutes)}
                  />
                  <Field
                    label={`Aandeel termijn ${installmentCredit.installmentNo}/${installmentCredit.installmentCount}`}
                    value={formatTegoed(installmentCredit.shareMinutes)}
                  />
                  <Field
                    label="Status van dit aandeel"
                    value={
                      installmentCredit.released ? (
                        <Badge variant="success">
                          Vrijgegeven ·{" "}
                          {formatTegoed(installmentCredit.releasedMinutes)}
                        </Badge>
                      ) : (
                        <Badge variant="warning">Nog niet vrijgegeven</Badge>
                      )
                    }
                  />
                  <Field
                    label="Schema totaal"
                    value={`${formatTegoed(
                      installmentCredit.planReleasedMinutes,
                    )} vrijgegeven · ${formatTegoed(
                      installmentCredit.planPendingMinutes,
                    )} resterend`}
                  />
                </dl>
              </CardContent>
            </Card>
          ) : null}

          {isDraft && isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Concept bewerken</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={updateInvoiceDraft} className="space-y-3">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="due_date">Vervaldatum</Label>
                    <Input
                      id="due_date"
                      name="due_date"
                      type="date"
                      defaultValue={invoice.due_date ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Interne notitie</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      rows={3}
                      maxLength={2000}
                      defaultValue={invoice.notes ?? ""}
                    />
                  </div>
                  <Button type="submit" size="sm" variant="secondary">
                    Concept opslaan
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {isOpen && isAdmin && !isCreditNote ? (
            <RecordPaymentCard
              invoice={invoice}
              remaining={remaining}
              flag={payFlag}
              error={payError}
            />
          ) : null}

          {isOpen && isAdmin && !isCreditNote ? (
            <MolliePaymentCard
              invoice={invoice}
              remaining={remaining}
              flag={mollieFlag}
              error={mollieError}
            />
          ) : null}

          {canCredit ? (
            <Card>
              <CardHeader>
                <CardTitle>Creditfactuur</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Maak een creditfactuur om deze factuur volledig te crediteren.
                  De creditfactuur krijgt een eigen nummer met negatieve
                  bedragen en verrekent automatisch het openstaande saldo.
                </p>
                <form action={createCreditNote} className="space-y-3">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="reason">Reden (optioneel)</Label>
                    <Textarea
                      id="reason"
                      name="reason"
                      rows={2}
                      maxLength={2000}
                      placeholder="bv. Foutief gefactureerd"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    className="w-full"
                  >
                    Creditfactuur aanmaken
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {isDraft ? (
                    <StatusButton
                      invoiceId={invoice.id}
                      status="open"
                      label="Versturen (op openstaand zetten)"
                      disabled={lines.length === 0}
                    />
                  ) : null}
                  {isOpen ? (
                    <StatusButton
                      invoiceId={invoice.id}
                      status="paid"
                      label="Markeren als betaald"
                      variant="primary"
                    />
                  ) : null}
                  {isDraft || isOpen ? (
                    <StatusButton
                      invoiceId={invoice.id}
                      status="cancelled"
                      label="Annuleren"
                      variant="ghost"
                    />
                  ) : null}
                  {!isDraft && !isOpen ? (
                    <p className="text-sm text-muted-foreground">
                      Statuswijzigingen niet meer mogelijk.
                    </p>
                  ) : null}
                  {isDraft && lines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Voeg minstens één regel toe voordat je de factuur kunt
                      versturen.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusButton({
  invoiceId,
  status,
  label,
  disabled,
  variant = "primary",
}: {
  invoiceId: string;
  status: "open" | "paid" | "cancelled";
  label: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <form action={setInvoiceStatus}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="status" value={status} />
      <Button
        type="submit"
        size="sm"
        variant={variant}
        disabled={disabled}
        className="w-full"
      >
        {label}
      </Button>
    </form>
  );
}

function RecordPaymentCard({
  invoice,
  remaining,
  flag,
  error,
}: {
  invoice: Invoice;
  remaining: number;
  flag: string | null;
  error: string | null;
}) {
  const errorLabels: Record<string, string> = {
    invalid_amount: "Vul een geldig bedrag groter dan € 0,00 in.",
  };
  let errorMsg: string | null = null;
  if (error) {
    errorMsg = errorLabels[error] ?? `Kon betaling niet vastleggen: ${error}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Betaling registreren</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Leg een ontvangen betaling vast (contant, bankoverschrijving of
          correctie). Resterend openstaand: {formatEuros(remaining)}.
        </p>
        {flag === "recorded" ? (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Betaling vastgelegd.
          </p>
        ) : null}
        {errorMsg ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {errorMsg}
          </p>
        ) : null}
        <form action={recordInvoicePayment} className="space-y-3">
          <input type="hidden" name="invoice_id" value={invoice.id} />
          <div className="space-y-1">
            <Label htmlFor="record_amount">Bedrag (€)</Label>
            <Input
              id="record_amount"
              name="amount_euros"
              type="text"
              inputMode="decimal"
              placeholder={(remaining / 100).toFixed(2)}
              defaultValue={(remaining / 100).toFixed(2)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="record_method">Methode</Label>
            <Input
              id="record_method"
              name="method"
              type="text"
              placeholder="bijv. contant, overschrijving"
              defaultValue="manual"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="record_note">Notitie (optioneel)</Label>
            <Textarea id="record_note" name="note" rows={2} />
          </div>
          <Button type="submit" size="sm" className="w-full">
            Betaling vastleggen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MolliePaymentCard({
  invoice,
  remaining,
  flag,
  error,
}: {
  invoice: Invoice;
  remaining: number;
  flag: string | null;
  error: string | null;
}) {
  const hasLink =
    Boolean(invoice.mollie_payment_id) &&
    Boolean(invoice.mollie_checkout_url) &&
    (invoice.mollie_status === "open" ||
      invoice.mollie_status === "pending" ||
      invoice.mollie_status === null);

  const errorLabels: Record<string, string> = {
    no_api_key:
      "Mollie API-sleutel ontbreekt. Stel deze in onder Instellingen.",
    key_decrypt_failed: "Kon Mollie-sleutel niet ontsleutelen.",
    not_open: "Alleen openstaande facturen kunnen een betaallink krijgen.",
    not_invoice: "Alleen facturen kunnen een betaallink krijgen.",
    not_found: "Factuur niet gevonden.",
    zero_amount: "Vul een geldig bedrag groter dan € 0,00 in.",
    amount_too_high: "Bedrag is hoger dan het openstaande saldo.",
    already_paid: "Deze factuur is al volledig betaald.",
    attach_failed: "Mollie-betaling aanmaken lukte wel, koppelen niet.",
  };
  let errorMsg: string | null = null;
  if (error) {
    errorMsg =
      errorLabels[error] ??
      (error.startsWith("api_")
        ? `Mollie API gaf een fout (${error.replace("api_", "HTTP ")}).`
        : `Onbekende fout: ${error}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Online betaling (Mollie)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {flag === "created" ? (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Betaallink aangemaakt.
          </p>
        ) : null}
        {flag === "existing" ? (
          <p className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-300">
            Bestaande betaallink is nog geldig.
          </p>
        ) : null}
        {errorMsg ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {errorMsg}
          </p>
        ) : null}

        {hasLink && invoice.mollie_checkout_url ? (
          <div className="space-y-2">
            <Label htmlFor="mollie_link">Betaallink (deel met leerling)</Label>
            <Input
              id="mollie_link"
              readOnly
              value={invoice.mollie_checkout_url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-xs text-muted-foreground">
              Status: {invoice.mollie_status ?? "open"}. Webhook werkt de
              factuur automatisch bij zodra Mollie de betaling bevestigt.
            </p>
          </div>
        ) : null}

        <form action={createMolliePayment} className="space-y-3">
          <input type="hidden" name="invoice_id" value={invoice.id} />
          <div className="space-y-1">
            <Label htmlFor="mollie_amount">Bedrag (€) — leeg = resterend</Label>
            <Input
              id="mollie_amount"
              name="amount_euros"
              type="text"
              inputMode="decimal"
              placeholder={(remaining / 100).toFixed(2)}
            />
            <p className="text-xs text-muted-foreground">
              Laat leeg voor het volledige openstaande saldo (
              {formatEuros(remaining)}), of vul een deelbedrag in.
            </p>
          </div>
          <Button type="submit" size="sm" className="w-full">
            {hasLink ? "Nieuwe betaallink genereren" : "Verzend betaallink"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: import("react").ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{value}</dd>
    </div>
  );
}
