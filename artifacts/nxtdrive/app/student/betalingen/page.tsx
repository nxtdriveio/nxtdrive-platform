import Link from "next/link";
import { ChevronRight, Wallet, Receipt } from "lucide-react";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PWAPageHeader,
  PWACard,
  PWASectionHeader,
  PWAEmptyState,
} from "@/components/pwa/primitives";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import { payStudentInvoice } from "../facturen/payment-actions";
import { StudentBalanceCard } from "@/components/student/BalanceCard";
import { CreditBreakdownCard } from "@/components/student/CreditBreakdownCard";
import { getActiveStudent } from "@/lib/students/access";
import {
  CREDIT_REASON_LABEL,
  formatTegoed,
  formatTegoedDelta,
  type CreditLedgerRow,
  type StudentBalance,
  type StudentCreditBreakdown,
} from "@/lib/students/types";
import {
  INSTALLMENT_CREDIT_MODE_LABEL,
  loadStudentInstallmentCredit,
} from "@/lib/invoices/installment-credit";
import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  displayStatus,
  formatEuros,
  remainingCents,
  type Invoice,
} from "@/lib/invoices/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function StudentBetalingenPage() {
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
  if (!student) {
    return (
      <Card>
        <CardContent className="pt-6">
          <PWAEmptyState message="Je account is nog niet gekoppeld aan een leerlingdossier." />
        </CardContent>
      </Card>
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
      .limit(20),
    supabase
      .from("invoices")
      .select("*")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false }),
  ]);
  const balance = ((balanceRes.data as StudentBalance | null)?.balance ??
    0) as number;
  const breakdown = breakdownRes.data as StudentCreditBreakdown | null;
  const rows = (ledgerRes.data ?? []) as CreditLedgerRow[];
  const invoices = (invoicesRes.data ?? []) as Invoice[];

  const installmentCredits = await loadStudentInstallmentCredit(
    supabase,
    student.id,
  );

  const isPayable = (inv: Invoice) =>
    inv.kind === "invoice" &&
    inv.status === "open" &&
    remainingCents(inv) > 0;
  const hasPayable = invoices.some(isPayable);
  const mollieConfigured = hasPayable
    ? (await getMollieApiKeyStatus(createServiceRoleClient(), tenant.id))
        .configured
    : false;

  return (
    <div className="space-y-4">
      <PWAPageHeader
        title="Betalingen"
        subtitle="Je tegoed, mutaties en facturen op één plek."
        icon={<Wallet className="h-4 w-4" aria-hidden />}
      />

      <StudentBalanceCard balance={balance} />

      {breakdown ? <CreditBreakdownCard breakdown={breakdown} /> : null}

      {installmentCredits.length > 0 ? (
        <PWACard>
          <PWASectionHeader>Tegoed in termijnen</PWASectionHeader>
          <ol className="divide-y divide-border">
            {installmentCredits.map((plan) => (
              <li key={plan.planId} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      {plan.description}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {INSTALLMENT_CREDIT_MODE_LABEL[plan.policy]} ·{" "}
                      {formatTegoed(plan.packageMinutes)} totaal
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge variant="success">
                      {formatTegoed(plan.releasedMinutes)} vrij
                    </Badge>
                    {plan.pendingMinutes > 0 ? (
                      <Badge variant="warning">
                        {formatTegoed(plan.pendingMinutes)} later
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </PWACard>
      ) : null}

      <section className="space-y-2">
        <PWASectionHeader icon={<Receipt className="h-3.5 w-3.5" aria-hidden />}>
          Facturen
        </PWASectionHeader>
        {invoices.length === 0 ? (
          <PWAEmptyState
            icon={<Receipt className="h-8 w-8" aria-hidden />}
            title="Geen facturen"
            message="Er zijn nog geen facturen voor jou aangemaakt."
          />
        ) : (
          <ol className="space-y-2">
            {invoices.map((inv) => {
              const display = displayStatus(inv);
              const remaining = remainingCents(inv);
              const canPayOnline = mollieConfigured && isPayable(inv);
              return (
                <li
                  key={inv.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                >
                  <Link
                    href={`/student/facturen/${inv.id}`}
                    className="block p-4 transition hover:bg-muted/50"
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
                  {canPayOnline ? (
                    <div className="border-t border-border p-3">
                      <form action={payStudentInvoice}>
                        <input
                          type="hidden"
                          name="invoice_id"
                          value={inv.id}
                        />
                        <Button type="submit" size="sm" className="w-full">
                          Betaal nu {formatEuros(remaining)}
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <PWACard>
        <PWASectionHeader>Recente mutaties</PWASectionHeader>
        {rows.length === 0 ? (
          <PWAEmptyState message="Nog geen mutaties op je tegoed." />
        ) : (
          <ol className="divide-y divide-border">
            {rows.map((r) => {
              const positive = r.delta > 0;
              const lessonHref =
                r.related_type === "lesson" && r.related_id
                  ? `/student/lessons/${r.related_id}`
                  : null;
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      {CREDIT_REASON_LABEL[r.reason]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dateFmt.format(new Date(r.created_at))}
                      {r.note ? ` · ${r.note}` : ""}
                      {lessonHref ? " · Bekijk les" : ""}
                    </div>
                  </div>
                  <Badge variant={positive ? "success" : "warning"}>
                    {formatTegoedDelta(r.delta)}
                  </Badge>
                  {lessonHref ? (
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                </>
              );
              return (
                <li key={r.id}>
                  {lessonHref ? (
                    <Link
                      href={lessonHref}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition hover:bg-muted/60"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </PWACard>
    </div>
  );
}
