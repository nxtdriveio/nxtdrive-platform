export type Package = {
  id: string;
  tenant_id: string;
  name: string;
  credits_total: number;
  price_cents: number;
  valid_days: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
