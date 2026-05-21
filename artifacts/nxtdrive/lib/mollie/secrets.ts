/**
 * Server-only helpers to read/write the per-tenant Mollie API key.
 *
 * The key is encrypted with AES-256-GCM (see lib/crypto/aead.ts) and stored
 * in the `tenant_secrets` table. Only the service role can read or write
 * that table, so the plain-text key never reaches the browser.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptString, encryptString } from "@/lib/crypto/aead";

export const MOLLIE_API_KEY_SECRET_KEY = "mollie_api_key";

type Row = {
  ciphertext: string;
  iv: string;
  auth_tag: string;
};

export async function getMollieApiKey(
  service: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("tenant_secrets")
    .select("ciphertext, iv, auth_tag")
    .eq("tenant_id", tenantId)
    .eq("key", MOLLIE_API_KEY_SECRET_KEY)
    .maybeSingle();
  if (error) {
    throw new Error(`getMollieApiKey: ${error.message}`);
  }
  if (!data) return null;
  const row = data as Row;
  return decryptString({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
  });
}

export async function setMollieApiKey(
  service: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  rawKey: string,
): Promise<void> {
  const trimmed = rawKey.trim();
  if (!trimmed) throw new Error("Mollie API key is empty");
  // Sanity guard. Mollie keys start with `test_` or `live_`.
  if (!/^(test|live)_[A-Za-z0-9]{8,}$/.test(trimmed)) {
    throw new Error(
      "Mollie API key must look like test_... or live_... (got something else).",
    );
  }
  const blob = encryptString(trimmed);
  const { error } = await service.rpc("set_tenant_secret", {
    p_tenant_id: tenantId,
    p_actor: actorUserId,
    p_key: MOLLIE_API_KEY_SECRET_KEY,
    p_ciphertext: blob.ciphertext,
    p_iv: blob.iv,
    p_auth_tag: blob.authTag,
  });
  if (error) throw new Error(`setMollieApiKey: ${error.message}`);
}

/**
 * Returns whether the tenant has a Mollie API key configured, plus a
 * lightweight masked preview ("test_a••••••mnop") for display. Never
 * returns the raw key.
 */
export async function getMollieApiKeyStatus(
  service: SupabaseClient,
  tenantId: string,
): Promise<{ configured: boolean; preview: string | null; mode: "test" | "live" | null }> {
  try {
    const raw = await getMollieApiKey(service, tenantId);
    if (!raw) return { configured: false, preview: null, mode: null };
    const mode = raw.startsWith("live_") ? "live" : "test";
    const preview = `${raw.slice(0, 6)}••••••${raw.slice(-4)}`;
    return { configured: true, preview, mode };
  } catch {
    return { configured: false, preview: null, mode: null };
  }
}
