import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InstallmentCreditPolicy } from "@/lib/invoices/installment-credit";
import type { PaymentReminderPolicy } from "@/lib/invoices/payment-reminder-policy";
import type { FinanceOnboardingFacts } from "./onboarding";

export async function loadFinanceOnboardingFacts(
  client: SupabaseClient,
  args: {
    tenantId: string;
    tenantName: string;
    mollie: FinanceOnboardingFacts["mollie"];
    paymentReminderPolicy: PaymentReminderPolicy;
    installmentCreditPolicy: InstallmentCreditPolicy;
    todayYmd?: string;
  },
): Promise<FinanceOnboardingFacts> {
  const todayYmd = args.todayYmd ?? new Date().toISOString().slice(0, 10);
  const [invoiceRes, packageRes, paymentRecordRes, vatRes] = await Promise.all([
    client
      .from("invoices")
      .select("status, due_date, mollie_checkout_url")
      .eq("tenant_id", args.tenantId)
      .limit(5000),
    client
      .from("packages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", args.tenantId),
    client
      .from("payment_records")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", args.tenantId),
    client
      .from("invoice_lines")
      .select("tax_rate_bp")
      .eq("tenant_id", args.tenantId)
      .limit(5000),
  ]);

  if (invoiceRes.error) {
    throw new Error(`Finance onboarding: facturen laden mislukt: ${invoiceRes.error.message}`);
  }
  if (packageRes.error) {
    throw new Error(`Finance onboarding: pakketten laden mislukt: ${packageRes.error.message}`);
  }
  if (paymentRecordRes.error) {
    throw new Error(
      `Finance onboarding: betaalrecords laden mislukt: ${paymentRecordRes.error.message}`,
    );
  }
  if (vatRes.error) {
    throw new Error(`Finance onboarding: btw-regels laden mislukt: ${vatRes.error.message}`);
  }

  const invoices = (invoiceRes.data ?? []) as Array<{
    status: string | null;
    due_date: string | null;
    mollie_checkout_url: string | null;
  }>;
  const invoiceCounts = {
    total: invoices.length,
    draft: invoices.filter((invoice) => invoice.status === "draft").length,
    open: invoices.filter((invoice) => invoice.status === "open").length,
    paid: invoices.filter((invoice) => invoice.status === "paid").length,
    overdue: invoices.filter(
      (invoice) =>
        invoice.status === "open" &&
        typeof invoice.due_date === "string" &&
        invoice.due_date < todayYmd,
    ).length,
    withOnlinePayment: invoices.filter((invoice) =>
      Boolean(invoice.mollie_checkout_url),
    ).length,
  };
  const vatRates = new Set(
    ((vatRes.data ?? []) as Array<{ tax_rate_bp: number | null }>)
      .map((row) => row.tax_rate_bp)
      .filter((rate): rate is number => typeof rate === "number"),
  );

  return {
    tenantName: args.tenantName,
    mollie: args.mollie,
    paymentReminderPolicy: args.paymentReminderPolicy,
    installmentCreditMode: args.installmentCreditPolicy.mode,
    packageCount: packageRes.count ?? 0,
    invoiceCounts,
    paymentRecordCount: paymentRecordRes.count ?? 0,
    vatRateCount: vatRates.size,
  };
}
