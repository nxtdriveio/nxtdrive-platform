/**
 * Platform-level e-mail configuration.
 *
 * - API key  → encrypted in `platform_secrets` (AES-256-GCM via MOLLIE_KEY_ENCRYPTION_SECRET)
 * - From email → plain JSON in `platform_settings`
 *
 * Falls back to SENDGRID_API_KEY / SENDGRID_FROM_EMAIL env vars when no DB
 * row exists, so existing deployments that only have env vars keep working.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptString, encryptString, maskApiKey } from "@/lib/crypto/aead";

const SENDGRID_SECRET_KEY = "sendgrid_api_key";
const FROM_EMAIL_SETTINGS_KEY = "sendgrid_from_email";

export type PlatformEmailConfig = {
  apiKey: string;
  fromEmail: string;
};

export type PlatformEmailConfigStatus = {
  configured: boolean;
  keyPreview: string | null;
  fromEmail: string | null;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPlatformSendgridKey(
  service: SupabaseClient,
): Promise<string | null> {
  const { data } = await service
    .from("platform_secrets")
    .select("ciphertext, iv, auth_tag")
    .eq("key", SENDGRID_SECRET_KEY)
    .maybeSingle();
  if (data) {
    const row = data as { ciphertext: string; iv: string; auth_tag: string };
    return decryptString({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag });
  }
  return process.env["SENDGRID_API_KEY"] ?? null;
}

export async function getPlatformFromEmail(
  service: SupabaseClient,
): Promise<string | null> {
  const { data } = await service
    .from("platform_settings")
    .select("value")
    .eq("key", FROM_EMAIL_SETTINGS_KEY)
    .maybeSingle();
  if (data?.value) {
    const val = data.value as Record<string, unknown>;
    if (typeof val.email === "string") return val.email;
  }
  return process.env["SENDGRID_FROM_EMAIL"] ?? null;
}

export async function getPlatformEmailConfig(
  service: SupabaseClient,
): Promise<PlatformEmailConfig | null> {
  const [apiKey, fromEmail] = await Promise.all([
    getPlatformSendgridKey(service).catch(() => null),
    getPlatformFromEmail(service).catch(() => null),
  ]);
  if (!apiKey || !fromEmail) return null;
  return { apiKey, fromEmail };
}

export async function getPlatformEmailConfigStatus(
  service: SupabaseClient,
): Promise<PlatformEmailConfigStatus> {
  try {
    const [apiKey, fromEmail] = await Promise.all([
      getPlatformSendgridKey(service),
      getPlatformFromEmail(service),
    ]);
    return {
      configured: Boolean(apiKey && fromEmail),
      keyPreview: apiKey ? maskApiKey(apiKey) : null,
      fromEmail: fromEmail ?? null,
    };
  } catch {
    return { configured: false, keyPreview: null, fromEmail: null };
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function setPlatformSendgridKey(
  service: SupabaseClient,
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
  const { error } = await service.from("platform_secrets").upsert(
    {
      key: SENDGRID_SECRET_KEY,
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      auth_tag: blob.authTag,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`setPlatformSendgridKey: ${error.message}`);
}

export async function setPlatformFromEmail(
  service: SupabaseClient,
  fromEmail: string,
): Promise<void> {
  const trimmed = fromEmail.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Vul een geldig verzendadres in.");
  }
  const { error } = await service.from("platform_settings").upsert(
    {
      key: FROM_EMAIL_SETTINGS_KEY,
      value: { email: trimmed },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`setPlatformFromEmail: ${error.message}`);
}
