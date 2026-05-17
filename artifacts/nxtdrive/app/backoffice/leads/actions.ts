"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/types";

function isValidStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

export async function updateStatus(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const next = formData.get("status");
  if (!leadId || !isValidStatus(next)) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("update_lead_status", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_to: next,
  });
  if (error) {
    // RPC raises when the lead is not in this tenant — fall back to the list.
    redirect("/backoffice/leads");
  }

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/leads");
  redirect(`/backoffice/leads/${leadId}`);
}

export async function addNote(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!leadId || !note) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("add_lead_note", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_note: note,
  });
  if (error) redirect("/backoffice/leads");

  revalidatePath(`/backoffice/leads/${leadId}`);
  redirect(`/backoffice/leads/${leadId}`);
}
