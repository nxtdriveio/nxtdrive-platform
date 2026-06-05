import OpenAI from "openai";

// OpenAI direct. We talk to the public OpenAI API with our own key and the
// default base URL — no proxy. The client is created lazily so a missing key
// fails inside the caller's try/catch (graceful NL degradation) instead of at
// module load.
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
 * Lazily constructs the OpenAI client. Throwing here (rather than at module
 * top-level) keeps the failure inside the caller's try/catch so AI features can
 * degrade to a friendly NL error instead of breaking server-action evaluation.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI-integratie is niet geconfigureerd (OPENAI_API_KEY ontbreekt).",
    );
  }
  client = new OpenAI({ apiKey });
  return client;
}

export const AI_MODEL = "gpt-4o-mini";
export const AI_MAX_TOKENS = 8192;
