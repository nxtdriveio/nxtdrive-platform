"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  ACCOUNTING_INTEGRATION_SETTINGS_KEY,
  mergeAccountingIntegrationSettings,
} from "@/lib/accounting/integrations";

export async function saveAccountingIntegration(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const service = createServiceRoleClient();

  const payload = mergeAccountingIntegrationSettings({
    enabled: formData.get("enabled") === "true",
    provider: String(formData.get("provider") ?? "none"),
    syncMode: String(formData.get("syncMode") ?? "manual_csv"),
    exportFormat: String(formData.get("exportFormat") ?? "nxtdrive_journal"),
    administrationName: String(formData.get("administrationName") ?? ""),
    administrationId: String(formData.get("administrationId") ?? ""),
    relationPrefix: String(formData.get("relationPrefix") ?? ""),
    invoiceJournalCode: String(formData.get("invoiceJournalCode") ?? ""),
    paymentJournalCode: String(formData.get("paymentJournalCode") ?? ""),
    accounts: {
      debtors: String(formData.get("account_debtors") ?? ""),
      revenueLessons: String(formData.get("account_revenueLessons") ?? ""),
      revenuePackages: String(formData.get("account_revenuePackages") ?? ""),
      vatPayable: String(formData.get("account_vatPayable") ?? ""),
      bank: String(formData.get("account_bank") ?? ""),
      paymentProvider: String(formData.get("account_paymentProvider") ?? ""),
      suspense: String(formData.get("account_suspense") ?? ""),
    },
    vatMappings: [
      {
        rateBp: Number(formData.get("vat_rate_2100") ?? 2100),
        code: String(formData.get("vat_code_2100") ?? ""),
        description: String(formData.get("vat_description_2100") ?? ""),
      },
      {
        rateBp: Number(formData.get("vat_rate_900") ?? 900),
        code: String(formData.get("vat_code_900") ?? ""),
        description: String(formData.get("vat_description_900") ?? ""),
      },
      {
        rateBp: Number(formData.get("vat_rate_0") ?? 0),
        code: String(formData.get("vat_code_0") ?? ""),
        description: String(formData.get("vat_description_0") ?? ""),
      },
    ],
    dimensions: {
      branchAsCostCenter: formData.get("dimension_branch") === "true",
      instructorAsProject: formData.get("dimension_instructor") === "true",
      packageAsProduct: formData.get("dimension_package") === "true",
    },
    controls: {
      requirePaidBeforeExport: formData.get("control_paid_only") === "true",
      includeCreditNotes: formData.get("control_credit_notes") === "true",
      splitVatLines: formData.get("control_split_vat") === "true",
      includeOpenInvoices: formData.get("control_open_invoices") === "true",
    },
  });

  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: ACCOUNTING_INTEGRATION_SETTINGS_KEY,
      value: payload,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) {
    redirect(
      `/backoffice/boekhouding?accounting=error&reason=${encodeURIComponent(
        error.message.slice(0, 200),
      )}`,
    );
  }

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "accounting.integration_settings_saved",
    target_type: "tenant",
    target_id: tenant.id,
    payload: {
      provider: payload.provider,
      syncMode: payload.syncMode,
      exportFormat: payload.exportFormat,
      enabled: payload.enabled,
    },
  });

  revalidatePath("/backoffice/boekhouding");
  redirect("/backoffice/boekhouding?accounting=saved");
}
