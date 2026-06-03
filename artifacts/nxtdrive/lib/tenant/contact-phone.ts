import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTACT_PHONE_KEY = "contact_phone";

/**
 * The school's public contact phone number, tenant-configurable via
 * tenant_settings (key `contact_phone`). Returned as a trimmed string, or null
 * when unset/blank — callers hide the "Bel" action when null. Never hardcoded.
 */
export async function loadContactPhone(
  service: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", CONTACT_PHONE_KEY)
    .maybeSingle();
  const value = (data?.value ?? null) as { phone?: unknown } | null;
  const phone = typeof value?.phone === "string" ? value.phone.trim() : "";
  return phone === "" ? null : phone;
}

/** A tel: href usable in an anchor, or null when no phone is set. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const compact = phone.replace(/[^\d+]/g, "");
  return compact === "" ? null : `tel:${compact}`;
}
