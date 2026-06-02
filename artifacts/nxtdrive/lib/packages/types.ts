export const OFFERING_CATEGORIES = [
  "los",
  "pakket",
  "traject",
  "examen",
] as const;
export type OfferingCategory = (typeof OFFERING_CATEGORIES)[number];

export const OFFERING_CATEGORY_LABEL: Record<OfferingCategory, string> = {
  los: "Los",
  pakket: "Pakket",
  traject: "Traject",
  examen: "Examen",
};

export type Package = {
  id: string;
  tenant_id: string;
  name: string;
  credits_total: number;
  price_cents: number;
  valid_days: number | null;
  active: boolean;
  category: OfferingCategory;
  terms: string | null;
  installments_enabled: boolean;
  installment_count: number | null;
  auto_grant: boolean;
  visible_on_website: boolean;
  visible_in_app: boolean;
  signal_threshold_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: OfferingCategory;
  price_cents: number;
  credit_minutes: number | null;
  visible_on_website: boolean;
  visible_in_app: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PackageProduct = {
  id: string;
  tenant_id: string;
  package_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
};

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
