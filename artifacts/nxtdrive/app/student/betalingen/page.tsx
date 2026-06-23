import Link from "next/link";
import { ChevronRight, CreditCard, Receipt, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PWAPage,
  PWAPageHeader,
  PWAEmptyState,
} from "@/components/pwa/primitives";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import { payStudentInvoice } from "../facturen/payment-actions";
import { getActiveStudent } from "@/lib/students/access";
import {
  CREDIT_REASON_LABEL,
  formatHours,
  formatTegoedDelta,
  type CreditLedgerRow,
  type StudentBalance,
  type StudentCreditBreakdown,
} from "@/lib/students/types";
import {
  INSTALLMENT_CREDIT_MODE_LABEL,
  loadStudentInstallmentCredit,
} from "@/lib/invoices/installment-credit";
import { buildInvoicePaymentStatusFlow } from "@/lib/invoices/payment-status-flow";
import {
  formatEuros,
  remainingCents,
  type Invoice,
} from "@/lib/invoices/types";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentProgressBar,
  StudentRing,
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";
import { createNlDateTimeFormatter, resolveTenantTimeZone } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function createStudentPaymentFormatters(timeZone: string) {
  return {
    dateFmt: createNlDateTimeFormatter(
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
      timeZone,
    ),
  };
}

export default async function StudentBetalingenPage() {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { dateFmt } = createStudentPaymentFormatters(resolveTenantTimeZone(tenant));
  const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
  if (needsChildPicker) redirect("/student/select-child");

  if (!student) {
    return (
      <StudentShowcaseCard title="Betalingen" eyebrow="Studentdossier">
        <StudentShowcaseEmptyState
          title="Nog geen leerling gekoppeld"
          description="Zodra je dossier gekoppeld is, verschijnen hier je tegoed, facturen en mutaties."
        />
      </StudentShowcaseCard>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [balanceRes, breakdownRes, ledgerRes, invoicesRes] = await Promise.all([
    supabase
      .from("student_credit_balance")
      .select("student_id, balance")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase
      .from("student_credit_breakdown")
      .select("*")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase
      .from("credit_ledger")
      .select("*")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("invoices")
      .select("*")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false }),
  ]);

  if (balanceRes.error) {
    throw new Error(`Tegoed laden mislukt: ${balanceRes.error.message}`);
  }
  if (breakdownRes.error) {
    throw new Error(`Tegoedopbouw laden mislukt: ${breakdownRes.error.message}`);
  }
  if (ledgerRes.error) {
    throw new Error(`Mutaties laden mislukt: ${ledgerRes.error.message}`);
  }
  if (invoicesRes.error) {
    throw new Error(`Facturen laden mislukt: ${invoicesRes.error.message}`);
  }

  const balance = ((balanceRes.data as StudentBalance | null)?.balance ?? 0) as number;
  const breakdown = breakdownRes.data as StudentCreditBreakdown | null;
  const rows = (ledgerRes.data ?? []) as CreditLedgerRow[];
  const invoices = (invoicesRes.data ?? []) as Invoice[];
  const installmentCredits = await loadStudentInstallmentCredit(supabase, student.id);

  const isPayable = (invoice: Invoice) =>
    invoice.kind === "invoice" && invoice.status === "open" && remainingCents(invoice) > 0;
  const hasPayable = invoices.some(isPayable);
  const mollieConfigured = hasPayable
    ? (await getMollieApiKeyStatus(createServiceRoleClient(), tenant.id)).configured
    : false;

  const availablePct = breakdown
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (breakdown.available_minutes /
              Math.max(breakdown.purchased_minutes + breakdown.adjustment_minutes, 1)) *
              100,
          ),
        ),
      )
    : balance > 0
      ? 100
      : 0;

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Betalingen"
        title="Betalingen"
        subtitle="Je tegoed, facturen en mutaties in één rustige studentweergave."
        icon={<Wallet className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseCard
        title="Pakket overzicht"
        eyebrow="Tegoed"
        info="Tegoed wordt intern in minuten bijgehouden en hier voor jou omgerekend naar overzichtelijke uren."
      >
        <div className="grid grid-cols-[6.8rem_minmax(0,1fr)] gap-4">
          <StudentRing value={availablePct} label="Over" caption={`${formatHours(balance)} uur`} />
          <div className="space-y-3">
            <div className="text-lg font-semibold text-white">
              {balance > 0 ? `${formatHours(balance)} uur beschikbaar` : "Geen beschikbaar tegoed"}
            </div>
            {breakdown ? (
              <>
                <StudentProgressBar
                  label="Aangekocht"
                  value={100}
                  rightLabel={`${formatHours(breakdown.purchased_minutes)} uur`}
                />
                <StudentProgressBar
                  label="Ingepland"
                  value={
                    breakdown.purchased_minutes > 0
                      ? (breakdown.planned_minutes / breakdown.purchased_minutes) * 100
                      : 0
                  }
                  rightLabel={`${formatHours(breakdown.planned_minutes)} uur`}
                />
                <StudentProgressBar
                  label="Verreden"
                  value={
                    breakdown.purchased_minutes > 0
                      ? (breakdown.driven_minutes / breakdown.purchased_minutes) * 100
                      : 0
                  }
                  rightLabel={`${formatHours(breakdown.driven_minutes)} uur`}
                />
              </>
            ) : (
              <div className="text-sm leading-6 text-white/58">
                Je tegoed wordt zichtbaar zodra je eerste pakket of ritmutatie is verwerkt.
              </div>
            )}
          </div>
        </div>
      </StudentShowcaseCard>

      {installmentCredits.length > 0 ? (
        <StudentShowcaseCard
          title="Termijntegoed"
          eyebrow="Deel vrijgeven"
          info="Bij termijnpakketten zie je welk deel al vrij is en welk deel later beschikbaar wordt."
        >
          <div className="space-y-2">
            {installmentCredits.map((plan) => (
              <div
                key={plan.planId}
                className="rounded-[1.15rem] border border-white/10 bg-white/[0.02] px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{plan.description}</div>
                    <div className="mt-1 text-xs text-white/46">
                      {INSTALLMENT_CREDIT_MODE_LABEL[plan.policy]}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge variant="success">{formatHours(plan.releasedMinutes)} uur vrij</Badge>
                    {plan.pendingMinutes > 0 ? (
                      <Badge variant="warning">{formatHours(plan.pendingMinutes)} uur later</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </StudentShowcaseCard>
      ) : null}

      <StudentShowcaseCard
        title="Facturen"
        eyebrow="Open en voldaan"
        info="Open facturen kun je direct vanuit je studentomgeving betalen wanneer online betalen voor jouw rijschool actief is."
      >
        {invoices.length === 0 ? (
          <PWAEmptyState message="Er zijn nog geen facturen voor jou aangemaakt." />
        ) : (
          <div className="space-y-2">
            {invoices.map((invoice) => {
              const flow = buildInvoicePaymentStatusFlow(invoice, {
                mollieConfigured,
              });
              return (
                <div
                  key={invoice.id}
                  className="overflow-hidden rounded-[1.15rem] border border-white/10 bg-white/[0.02]"
                >
                  <Link
                    href={`/student/facturen/${invoice.id}`}
                    className="flex items-center gap-3 px-3 py-3 transition hover:bg-white/[0.03]"
                  >
                    <StudentInitialBadge label="€" tone="orange" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        Factuur #{String(invoice.invoice_no).padStart(4, "0")}
                      </div>
                      <div className="mt-1 text-xs text-white/46">
                        {flow.dueLabel ??
                          `Aangemaakt ${dateFmt.format(new Date(invoice.created_at))}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant={flow.badgeVariant}>{flow.badgeLabel}</Badge>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {formatEuros(invoice.total_cents)}
                      </div>
                      {flow.remainingCents > 0 ? (
                        <div className="text-xs text-white/42">
                          Nog open {flow.remainingLabel}
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/24" aria-hidden />
                  </Link>
                  {flow.canPayOnline ? (
                    <div className="border-t border-white/8 px-3 py-3">
                      <form action={payStudentInvoice}>
                        <input type="hidden" name="invoice_id" value={invoice.id} />
                        <Button type="submit" size="sm" className="h-11 w-full">
                          Betaal nu {flow.remainingLabel}
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </StudentShowcaseCard>

      <StudentShowcaseCard
        title="Recente mutaties"
        eyebrow="Pakketbewegingen"
        info="Zo zie je precies welke les, correctie of aankoop je tegoed heeft beïnvloed."
      >
        {rows.length === 0 ? (
          <PWAEmptyState message="Nog geen mutaties op je tegoed." />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const positive = row.delta > 0;
              const lessonHref =
                row.related_type === "lesson" && row.related_id
                  ? `/student/lessons/${row.related_id}`
                  : undefined;
              return (
                <StudentListRow
                  key={row.id}
                  href={lessonHref}
                  title={CREDIT_REASON_LABEL[row.reason]}
                  subtitle={row.note ?? "Automatisch verwerkt in je dossier"}
                  meta={dateFmt.format(new Date(row.created_at))}
                  badge={formatTegoedDelta(row.delta)}
                  badgeVariant={positive ? "success" : "warning"}
                  leading={
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/14 text-primary">
                      <CreditCard className="h-5 w-5" aria-hidden />
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </StudentShowcaseCard>

      <div className="px-1 text-xs text-white/42">
        <span className="inline-flex items-center gap-1">
          <Receipt className="h-3.5 w-3.5" aria-hidden />
          Factuurbetalingen blijven tenant-safe en lopen alleen via jouw eigen dossier.
        </span>
      </div>
    </PWAPage>
  );
}
