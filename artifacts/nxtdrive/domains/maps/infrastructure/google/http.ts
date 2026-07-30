import "server-only";

export class MapsProviderError extends Error {
  readonly code:
    | "NOT_CONFIGURED"
    | "TIMEOUT"
    | "QUOTA"
    | "CREDENTIAL"
    | "INVALID_RESPONSE"
    | "PROVIDER_ERROR";
  readonly status: number | null;

  constructor(
    code: MapsProviderError["code"],
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "MapsProviderError";
    this.code = code;
    this.status = status;
  }
}

export type SafeFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export function serverCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new MapsProviderError(
      "NOT_CONFIGURED",
      `Maps-providercredential ${name} is niet geconfigureerd.`,
    );
  }
  return value;
}

export async function googleJson<T>(
  input: {
    url: string;
    apiKey?: string;
    accessToken?: string;
    fieldMask?: string;
    method?: "GET" | "POST";
    body?: unknown;
    timeoutMs?: number;
  },
  fetcher: SafeFetch = fetch,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (input.apiKey) headers["X-Goog-Api-Key"] = input.apiKey;
  if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`;
  if (input.fieldMask) headers["X-Goog-FieldMask"] = input.fieldMask;
  if (input.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetcher(input.url, {
      method: input.method ?? (input.body === undefined ? "GET" : "POST"),
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: AbortSignal.timeout(input.timeoutMs ?? 6_000),
    });
  } catch (error) {
    throw new MapsProviderError(
      error instanceof DOMException && error.name === "TimeoutError"
        ? "TIMEOUT"
        : "PROVIDER_ERROR",
      "Maps-provider is tijdelijk niet bereikbaar.",
    );
  }
  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? "CREDENTIAL"
        : response.status === 429
          ? "QUOTA"
          : "PROVIDER_ERROR";
    throw new MapsProviderError(
      code,
      `Maps-provider gaf status ${response.status}.`,
      response.status,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new MapsProviderError(
      "INVALID_RESPONSE",
      "Maps-provider gaf geen geldige JSON-respons.",
      response.status,
    );
  }
}

export function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) return null;
  const seconds = Number.parseFloat(match[1]!);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}
