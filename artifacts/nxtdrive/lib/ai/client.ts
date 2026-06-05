/**
 * Module-level OpenAI client.
 *
 * ## Key resolution order (highest priority first):
 *   1. DB-configured platform key — loaded via `primeAiClientIfNeeded(service)`
 *      in `lib/ai/platform-config.ts`. EVERY server action that invokes AI
 *      MUST call this helper before invoking any advisor function.
 *   2. OPENAI_API_KEY env var — fallback for environments where no DB key is
 *      stored (e.g. early staging deploys that only set the env var).
 *
 * New AI entry points: always call `primeAiClientIfNeeded(service)` first, then
 * call the advisor functions which internally call `getOpenAIClient()`. This
 * guarantees the DB-configured key is always used when present.
 */

import OpenAI from "openai";

let client: OpenAI | null = null;
let primedKey: string | null = null;

/**
 * Override the module-level client with a key fetched from the DB. Call this
 * at the top of any server action that uses AI, so the platform-configured
 * key takes precedence over the OPENAI_API_KEY env var. Idempotent: a second
 * call with the same key is a no-op.
 */
export function primeOpenAIClient(apiKey: string): void {
  if (primedKey !== apiKey) {
    primedKey = apiKey;
    client = new OpenAI({ apiKey });
  }
}

/**
 * Returns the current OpenAI client. Lazily constructs one from the env var
 * when no DB-primed client exists. Throws with a friendly NL message when
 * neither a primed client nor the env var is present — the caller's try/catch
 * surfaces this as a user-visible error rather than a crash.
 *
 * Do NOT call this directly from server actions. Call `primeAiClientIfNeeded`
 * first to ensure the DB-configured key is loaded, then let advisor functions
 * call this internally.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI-integratie is niet geconfigureerd. Stel een OpenAI API-sleutel in via het platform-beheer.",
    );
  }
  client = new OpenAI({ apiKey });
  return client;
}

export const AI_MODEL = "gpt-4o-mini";
export const AI_MAX_TOKENS = 8192;
