import OpenAI from "openai";

// Replit AI Integrations proxy. Both vars are provisioned by the integration
// setup; the API key is a proxy placeholder and is only valid together with the
// base URL.
let client: OpenAI | null = null;

/**
 * Lazily constructs the OpenAI client. Throwing here (rather than at module
 * top-level) keeps the failure inside the caller's try/catch so AI features can
 * degrade to a friendly NL error instead of breaking server-action evaluation.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error(
      "AI-integratie is niet geconfigureerd (OpenAI-omgevingsvariabelen ontbreken).",
    );
  }
  client = new OpenAI({ apiKey, baseURL });
  return client;
}

export const AI_MODEL = "gpt-5.4";
export const AI_MAX_TOKENS = 8192;
