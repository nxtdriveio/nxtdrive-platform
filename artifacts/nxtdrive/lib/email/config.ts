/**
 * Per-tenant SendGrid email configuration.
 *
 * - API key  → stored encrypted in `tenant_secrets` (AES-256-GCM, same key as Mollie)
 * - From address → stored as plain JSON in `tenant_settings` (not sensitive)
 *
 * Falls back to the platform-level env vars (SENDGRID_API_KEY /
 * SENDGRID_FROM_EMAIL) when a tenant has not configured their own keys yet,
 * so existing behaviour is preserved for tenants that haven't set up email.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptString, encryptString } from "@/lib/crypto/aead";

export const SENDGRID_API_KEY_SECRET = "sendgrid_api_key";
export const EMAIL_CONFIG_SETTINGS_KEY = "email_config";

export type TenantEmailConfig = {
  apiKey: string;
  fromEmail: string;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getSendgridApiKey(
  service: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("tenant_secrets")
    .select("ciphertext, iv, auth_tag")
    .eq("tenant_id", tenantId)
    .eq("key", SENDGRID_API_KEY_SECRET)
    .maybeSingle();
  if (error) throw new Error(`getSendgridApiKey: ${error.message}`);
  if (!data) return null;
  const row = data as { ciphertext: string; iv: string; auth_tag: string };
  return decryptString({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
  });
}

export async function getEmailFromAddress(
  service: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", EMAIL_CONFIG_SETTINGS_KEY)
    .maybeSingle();
  if (!data) return null;
  const val = data.value as Record<string, unknown> | null;
  return typeof val?.from_email === "string" ? val.from_email : null;
}

/**
 * Returns both config values together, or null if either is missing.
 * Use this to optionally override the platform env vars on sendEmail calls.
 */
export async function getEmailConfig(
  service: SupabaseClient,
  tenantId: string,
): Promise<TenantEmailConfig | null> {
  const [apiKey, fromEmail] = await Promise.all([
    getSendgridApiKey(service, tenantId).catch(() => null),
    getEmailFromAddress(service, tenantId).catch(() => null),
  ]);
  if (!apiKey || !fromEmail) return null;
  return { apiKey, fromEmail };
}

export type EmailConfigStatus = {
  configured: boolean;
  keyPreview: string | null;
  fromEmail: string | null;
};

/**
 * For the settings UI: never exposes the raw API key, only a masked preview.
 */
export async function getEmailConfigStatus(
  service: SupabaseClient,
  tenantId: string,
): Promise<EmailConfigStatus> {
  try {
    const [apiKey, fromEmail] = await Promise.all([
      getSendgridApiKey(service, tenantId),
      getEmailFromAddress(service, tenantId),
    ]);
    if (!apiKey) return { configured: false, keyPreview: null, fromEmail: fromEmail ?? null };
    const keyPreview = `${apiKey.slice(0, 6)}••••••${apiKey.slice(-4)}`;
    return {
      configured: Boolean(apiKey && fromEmail),
      keyPreview,
      fromEmail: fromEmail ?? null,
    };
  } catch {
    return { configured: false, keyPreview: null, fromEmail: null };
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function setSendgridApiKey(
  service: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  rawKey: string,
): Promise<void> {
  const trimmed = rawKey.trim();
  if (!trimmed) throw new Error("SendGrid API-sleutel is leeg.");
  if (!trimmed.startsWith("SG.") || trimmed.length < 20) {
    throw new Error(
      "Een SendGrid API-sleutel begint met SG. en is minimaal 20 tekens. Kopieer de sleutel uit je SendGrid-dashboard.",
    );
  }
  const blob = encryptString(trimmed);
  const { error } = await service.rpc("set_tenant_secret", {
    p_tenant_id: tenantId,
    p_actor: actorUserId,
    p_key: SENDGRID_API_KEY_SECRET,
    p_ciphertext: blob.ciphertext,
    p_iv: blob.iv,
    p_auth_tag: blob.authTag,
  });
  if (error) throw new Error(`setSendgridApiKey: ${error.message}`);
}

export async function setEmailFromAddress(
  service: SupabaseClient,
  tenantId: string,
  fromEmail: string,
): Promise<void> {
  const trimmed = fromEmail.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Vul een geldig verzendadres in.");
  }
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenantId,
      key: EMAIL_CONFIG_SETTINGS_KEY,
      value: { from_email: trimmed },
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) throw new Error(`setEmailFromAddress: ${error.message}`);
}
