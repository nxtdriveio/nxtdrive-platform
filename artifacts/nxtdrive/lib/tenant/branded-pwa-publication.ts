import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const BRANDED_PWA_PUBLICATION_KEY = "branded_pwa_publication";

export type BrandedPwaSurface = "admin" | "instructor" | "student" | "parent";

export type BrandedPwaPublicationStatus =
  | "not_requested"
  | "review"
  | "published"
  | "paused";

export type BrandedPwaPublication = {
  status: BrandedPwaPublicationStatus;
  surfaces: BrandedPwaSurface[];
  notes: string | null;
  updated_at: string | null;
  updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
};

const SURFACES = ["admin", "instructor", "student", "parent"] as const;
const STATUSES = ["not_requested", "review", "published", "paused"] as const;

const DEFAULT_BRANDED_PWA_PUBLICATION: BrandedPwaPublication = {
  status: "not_requested",
  surfaces: [],
  notes: null,
  updated_at: null,
  updated_by: null,
  published_at: null,
  published_by: null,
};

type SettingsClient = Pick<SupabaseClient, "from">;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeBrandedPwaPublication(
  value: unknown,
): BrandedPwaPublication {
  const input = asObject(value);
  if (!input) return DEFAULT_BRANDED_PWA_PUBLICATION;

  const status =
    typeof input.status === "string" &&
    (STATUSES as readonly string[]).includes(input.status)
      ? (input.status as BrandedPwaPublicationStatus)
      : DEFAULT_BRANDED_PWA_PUBLICATION.status;
  const surfaces = Array.isArray(input.surfaces)
    ? input.surfaces.filter((surface): surface is BrandedPwaSurface =>
        typeof surface === "string" &&
        (SURFACES as readonly string[]).includes(surface),
      )
    : [];

  return {
    status,
    surfaces: Array.from(new Set(surfaces)),
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes : null,
    updated_at:
      typeof input.updated_at === "string" ? input.updated_at : null,
    updated_by:
      typeof input.updated_by === "string" ? input.updated_by : null,
    published_at:
      typeof input.published_at === "string" ? input.published_at : null,
    published_by:
      typeof input.published_by === "string" ? input.published_by : null,
  };
}

export async function loadBrandedPwaPublication(
  client: SettingsClient,
  tenantId: string,
): Promise<BrandedPwaPublication> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", BRANDED_PWA_PUBLICATION_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`loadBrandedPwaPublication: ${error.message}`);
  }

  return normalizeBrandedPwaPublication(data?.value);
}

export function brandedPwaSurfaceLabel(surface: BrandedPwaSurface): string {
  if (surface === "admin") return "Admin";
  if (surface === "instructor") return "Instructeur";
  if (surface === "student") return "Leerling";
  return "Ouder";
}

export function brandedPwaStatusLabel(
  status: BrandedPwaPublicationStatus,
): string {
  if (status === "review") return "In review";
  if (status === "published") return "Gepubliceerd";
  if (status === "paused") return "Gepauzeerd";
  return "Niet aangevraagd";
}
