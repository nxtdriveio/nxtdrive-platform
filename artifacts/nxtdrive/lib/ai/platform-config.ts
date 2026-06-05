/**
 * Platform-level AI (OpenAI) configuration.
 *
 * - API key → encrypted in `platform_secrets` (AES-256-GCM via MOLLIE_KEY_ENCRYPTION_SECRET)
 *
 * Falls back to OPENAI_API_KEY env var when no DB row exists, so existing
 * deployments that only have env vars keep working.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptString, encryptString, maskApiKey } from "@/lib/crypto/aead";
import { primeOpenAIClient } from "./client";

const OPENAI_SECRET_KEY = "openai_api_key";

export type AiConfigStatus = {
  configured: boolean;
  keyPreview: string | null;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAiApiKey(
  service: SupabaseClient,
): Promise<string | null> {
  const { data } = await service
    .from("platform_secrets")
    .select("ciphertext, iv, auth_tag")
    .eq("key", OPENAI_SECRET_KEY)
    .maybeSingle();
  if (data) {
    const row = data as { ciphertext: string; iv: string; auth_tag: string };
    return decryptString({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
    });
  }
  return process.env["OPENAI_API_KEY"] ?? null;
}

export async function getAiConfigStatus(
  service: SupabaseClient,
): Promise<AiConfigStatus> {
  try {
    const key = await getAiApiKey(service);
    return {
      configured: Boolean(key),
      keyPreview: key ? maskApiKey(key) : null,
    };
  } catch {
    return { configured: false, keyPreview: null };
  }
}

/**
 * Fetch the AI API key from the DB (falling back to env) and prime the
 * module-level OpenAI client with it. Call this once at the top of any
 * server action that uses the AI, so the DB-configured key takes precedence.
 */
export async function primeAiClientIfNeeded(
  service: SupabaseClient,
): Promise<void> {
  try {
    const key = await getAiApiKey(service);
    if (key) primeOpenAIClient(key);
  } catch {
    // Degraded gracefully — getOpenAIClient() will fall back to env var.
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function setPlatformAiKey(
  service: SupabaseClient,
  rawKey: string,
): Promise<void> {
  const trimmed = rawKey.trim();
  if (!trimmed) throw new Error("OpenAI API-sleutel is leeg.");
  if (!trimmed.startsWith("sk-") || trimmed.length < 20) {
    throw new Error(
      "Een OpenAI API-sleutel begint met sk- en is minimaal 20 tekens. Kopieer de sleutel uit je OpenAI-dashboard.",
    );
  }
  const blob = encryptString(trimmed);
  const { error } = await service.from("platform_secrets").upsert(
    {
      key: OPENAI_SECRET_KEY,
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      auth_tag: blob.authTag,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`setPlatformAiKey: ${error.message}`);
}
