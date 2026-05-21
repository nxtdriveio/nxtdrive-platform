/**
 * Minimal Mollie REST client. We deliberately do NOT pull in the official
 * SDK — the surface area we need (create payment, get payment) is tiny and
 * the SDK would drag bundle weight + auto-update churn into the server build.
 *
 * Every call is per-tenant: the API key is the tenant's own Mollie key,
 * stored encrypted in `tenant_secrets`. There is no cross-tenant client
 * state.
 *
 * Test mode: tests can swap the underlying fetch with `__setMollieFetch` to
 * avoid real network calls.
 */

const MOLLIE_API_BASE = "https://api.mollie.com/v2";

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

let fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike;

/** Test-only: swap in a fake fetch. Resets back via `__resetMollieFetch`. */
export function __setMollieFetch(fn: FetchLike): void {
  fetchImpl = fn;
}
export function __resetMollieFetch(): void {
  fetchImpl = globalThis.fetch as unknown as FetchLike;
}

export type MollieAmount = { value: string; currency: string };

export type MolliePayment = {
  id: string;
  status:
    | "open"
    | "canceled"
    | "pending"
    | "authorized"
    | "expired"
    | "failed"
    | "paid";
  amount: MollieAmount;
  description: string;
  method: string | null;
  paidAt?: string | null;
  metadata?: Record<string, unknown> | null;
  _links?: {
    checkout?: { href: string; type?: string };
  };
};

export type CreatePaymentInput = {
  apiKey: string;
  amountCents: number;
  currency?: string; // default EUR
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  metadata?: Record<string, unknown>;
};

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function formatAmount(cents: number, currency: string): MollieAmount {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid amount in cents: ${cents}`);
  }
  // Mollie wants 2-decimal string, e.g. "12.50". EUR has 2 decimals.
  const value = (cents / 100).toFixed(2);
  return { value, currency };
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<MolliePayment> {
  const currency = input.currency ?? "EUR";
  const body = {
    amount: formatAmount(input.amountCents, currency),
    description: input.description.slice(0, 255),
    redirectUrl: input.redirectUrl,
    webhookUrl: input.webhookUrl,
    metadata: input.metadata ?? {},
  };
  const res = await fetchImpl(`${MOLLIE_API_BASE}/payments`, {
    method: "POST",
    headers: authHeaders(input.apiKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new MollieApiError(
      `Mollie createPayment failed: HTTP ${res.status}`,
      res.status,
      text,
    );
  }
  return JSON.parse(text) as MolliePayment;
}

export async function getPayment(
  apiKey: string,
  paymentId: string,
): Promise<MolliePayment> {
  if (!/^[A-Za-z0-9_]+$/.test(paymentId)) {
    throw new Error(`Invalid Mollie payment id: ${paymentId}`);
  }
  const res = await fetchImpl(
    `${MOLLIE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: authHeaders(apiKey),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new MollieApiError(
      `Mollie getPayment failed: HTTP ${res.status}`,
      res.status,
      text,
    );
  }
  return JSON.parse(text) as MolliePayment;
}

export class MollieApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function mollieAmountToCents(a: MollieAmount): number {
  // "12.50" → 1250.
  const parts = a.value.split(".");
  const whole = parseInt(parts[0] ?? "0", 10);
  const frac = parseInt((parts[1] ?? "00").padEnd(2, "0").slice(0, 2), 10);
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) {
    throw new Error(`Invalid Mollie amount value: ${a.value}`);
  }
  return whole * 100 + frac;
}
