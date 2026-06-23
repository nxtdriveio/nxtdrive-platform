import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Task #96 — tenant-configurable section visibility for the Ouderportaal.
//
// The parent portal (/ouder) is read-only and shows ONLY non-internal data of
// the parent's linked child(ren). Which sections a tenant exposes to parents is
// configurable per school via tenant_settings key `parent_portal_visibility`.
// Every section defaults to visible; a tenant admin can switch any off, in
// which case the portal neither renders the section nor loads its data.
//
// Mirrors the cancellation_policy / lead_score_policy pattern: the stored JSON
// is always sanitised through mergeParentPortalVisibility so a malformed write
// can never break the portal. Never hardcoded per school.
//
// Sections are limited to data parents can actually read under RLS:
//   planning        — geplande lessen & examens
//   voortgang       — examenrijpheid / leskaart
//   examens         — examenplanning (CBR-status + geplande examens)
//   facturen        — facturen (non-draft, via 0058 guardian RLS branch)
//   betalingen      — betaalstatus/-historie afgeleid van betaalde facturen
//   pakketinformatie — toegekende lespakketten (uit credit_ledger + packages)
//   tegoed          — lestegoed (saldo + mutaties)
//   documenten      — dossierdocumenten van het kind (alleen-lezen). Gekoppelde
//                     ouders lezen de metadata via de guardian-RLS-tak (0059);
//                     bestanden zelf blijven privé en worden alleen via korte
//                     server-getekende download-URL's geleverd.
// Internal notes are never exposed; online betalen verloopt nooit via dit portaal.
// ---------------------------------------------------------------------------

export const PARENT_PORTAL_VISIBILITY_KEY = "parent_portal_visibility";

export const PARENT_PORTAL_SECTIONS = [
  "planning",
  "voortgang",
  "examens",
  "facturen",
  "betalingen",
  "pakketinformatie",
  "tegoed",
  "documenten",
] as const;

export type ParentPortalSection = (typeof PARENT_PORTAL_SECTIONS)[number];

export type ParentPortalVisibility = Record<ParentPortalSection, boolean>;

export const PARENT_PORTAL_SECTION_LABEL: Record<ParentPortalSection, string> = {
  planning: "Planning",
  voortgang: "Voortgang",
  examens: "Examens",
  facturen: "Facturen",
  betalingen: "Betalingen",
  pakketinformatie: "Pakketinformatie",
  tegoed: "Lestegoed",
  documenten: "Documenten",
};

export const PARENT_PORTAL_SECTION_DESCRIPTION: Record<
  ParentPortalSection,
  string
> = {
  planning: "Geplande lessen en afspraken van het kind.",
  voortgang: "Examenrijpheid en voortgang (leskaart).",
  examens: "CBR-status en geplande (tussen)examens.",
  facturen: "Verstuurde facturen, betaalstatus en PDF-downloads.",
  betalingen: "Betaalstatus en historie van open en voldane facturen.",
  pakketinformatie: "Toegekende lespakketten van het kind.",
  tegoed: "Lestegoedsaldo en de mutaties daarop.",
  documenten:
    "Dossierdocumenten zijn niet beschikbaar in het ouderportaal (privacy).",
};

// Every section visible by default — a school opts OUT, never in.
export const DEFAULT_PARENT_PORTAL_VISIBILITY: ParentPortalVisibility = {
  planning: true,
  voortgang: true,
  examens: true,
  facturen: true,
  betalingen: true,
  pakketinformatie: true,
  tegoed: true,
  documenten: true,
};

/**
 * Merge an untrusted tenant override onto the defaults. Unknown keys are
 * dropped; each known section is coerced to a strict boolean. A missing section
 * falls back to its default (visible) so a partial write never hides a section
 * the admin did not touch.
 */
export function mergeParentPortalVisibility(
  override: unknown,
): ParentPortalVisibility {
  const result: ParentPortalVisibility = { ...DEFAULT_PARENT_PORTAL_VISIBILITY };
  if (!override || typeof override !== "object") return result;
  const o = override as Record<string, unknown>;
  for (const section of PARENT_PORTAL_SECTIONS) {
    if (section in o) {
      result[section] = o[section] === true || o[section] === "true";
    }
  }
  return result;
}

/**
 * Read the tenant's parent-portal visibility. The client must be able to read
 * tenant_settings for this tenant (RLS allows tenant members; service role is
 * fine). Falls back to the platform defaults on any read error.
 */
export async function loadParentPortalVisibility(
  client: SupabaseClient,
  tenantId: string,
): Promise<ParentPortalVisibility> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", PARENT_PORTAL_VISIBILITY_KEY)
    .maybeSingle();
  if (error) return mergeParentPortalVisibility(null);
  return mergeParentPortalVisibility(data?.value ?? null);
}
