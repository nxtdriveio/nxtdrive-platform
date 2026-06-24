"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { PRODUCT_OPS_ROLES } from "@/lib/product-ops";

function text(formData: FormData, key: string, max = 200) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function createSupportTicket(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const title = text(formData, "title", 160);
  const description = text(formData, "description", 4000);
  const category = text(formData, "category", 40) || "question";
  const priority = text(formData, "priority", 40) || "normal";

  if (title.length < 4) return;

  const service = createServiceRoleClient();
  await service.from("support_tickets").insert({
    tenant_id: tenant.id,
    title,
    description,
    category,
    priority,
    status: "open",
    source: "tenant_dashboard",
    requester_user_id: user.id,
    last_response_at: new Date().toISOString(),
  });

  revalidatePath("/backoffice/support");
}

export async function addSupportTicketComment(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const ticketId = text(formData, "ticket_id", 80);
  const body = text(formData, "body", 4000);
  if (!ticketId || !body) return;

  const service = createServiceRoleClient();
  const { data: ticket } = await service
    .from("support_tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!ticket) return;

  await service.from("support_ticket_comments").insert({
    ticket_id: ticketId,
    tenant_id: tenant.id,
    author_user_id: user.id,
    visibility: "tenant",
    body,
  });

  await service
    .from("support_tickets")
    .update({ last_response_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("tenant_id", tenant.id);

  revalidatePath("/backoffice/support");
}

export async function updateSupportTicketStatus(formData: FormData) {
  const { tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const ticketId = text(formData, "ticket_id", 80);
  const status = text(formData, "status", 40);
  if (!ticketId || !status) return;

  const service = createServiceRoleClient();
  await service
    .from("support_tickets")
    .update({
      status,
      resolved_at:
        status === "resolved" || status === "closed"
          ? new Date().toISOString()
          : null,
    })
    .eq("id", ticketId)
    .eq("tenant_id", tenant.id);

  revalidatePath("/backoffice/support");
}
