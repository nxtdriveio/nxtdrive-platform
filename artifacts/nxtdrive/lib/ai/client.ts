import OpenAI from "openai";

// OpenAI direct. We talk to the public OpenAI API with our own key and the
// default base URL — no proxy. The client is created lazily so a missing key
// fails inside the caller's try/catch (graceful NL degradation) instead of at
// module load.
let client: OpenAI | null = null;

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
